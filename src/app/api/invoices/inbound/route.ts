export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { normalizeLineItems } from "@/lib/normalizeLineItems";

// ── POST /api/invoices/inbound ────────────────────────────────────────────────
// Receives forwarded invoice emails from Resend Inbound (or any SMTP webhook).
// Webhook payload shape (Resend Inbound):
//   { from, to, subject, text, html, attachments: [{ filename, content (base64), contentType }] }
//
// The "to" address encodes the location: loc-{SLUG}@invoices.cashcall.io
// We look up the slug → location_id, then run existing OCR pipeline.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INBOUND_SECRET = process.env.INBOUND_EMAIL_WEBHOOK_SECRET ?? "";

interface ResendAttachment {
  filename: string;
  content: string;       // base64
  contentType: string;
}

interface InboundPayload {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  attachments?: ResendAttachment[];
}

export async function POST(req: NextRequest) {
  // ── Verify webhook secret ──────────────────────────────────────────────────
  const sig = req.headers.get("x-resend-signature") ?? req.headers.get("x-webhook-secret") ?? "";
  // Closed unless a secret is configured: without one, anyone could post invoices and run paid OCR.
  if (!INBOUND_SECRET || sig !== INBOUND_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = await req.json() as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Resolve location from recipient address ────────────────────────────────
  const toAddress = Array.isArray(payload.to) ? payload.to[0] : payload.to;
  const slugMatch = toAddress?.match(/^(loc-[a-z0-9-]+)@invoices\.cashcall\.io$/i);
  if (!slugMatch) {
    return NextResponse.json({ error: "No matching CashCall address" }, { status: 400 });
  }
  const slug = slugMatch[1].toLowerCase();

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: emailAddr } = await db
    .from("invoice_email_addresses")
    .select("location_id")
    .eq("email_slug", slug)
    .single();

  if (!emailAddr) {
    console.warn("[inbound-invoice] Unknown slug:", slug);
    return NextResponse.json({ error: "Unknown address" }, { status: 404 });
  }
  const locationId = emailAddr.location_id;

  // ── Process each attachment ────────────────────────────────────────────────
  const attachments = (payload.attachments ?? []).filter(a =>
    a.contentType === "application/pdf" ||
    a.contentType.startsWith("image/")
  );

  if (attachments.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, note: "No PDF or image attachment" });
  }

  let processedCount = 0;
  const errors: string[] = [];

  for (const attachment of attachments) {
    try {
      const fileBuffer = Buffer.from(attachment.content, "base64");
      const isPDF = attachment.contentType === "application/pdf";
      const invoiceDate = new Date().toISOString().slice(0, 10);

      // ── Call Claude OCR (same logic as /api/ocr) ──────────────────────────
      const mediaType = isPDF ? "application/pdf" : (attachment.contentType as "image/jpeg" | "image/png" | "image/webp");

      // ── Broadliner OCR prompt (matches /api/ocr v2.0) ────────────────────
      const BROADLINER_PROMPT = `You are CashCall's broadliner invoice parsing engine. Extract all invoices from this document.

Identify distributor: SYSCO (7-digit codes), US_FOODS (6-digit codes), PFG (Bravada/Affinity/Roma brands), GFS (letter-prefix codes), RESTAURANT_DEPOT (Jetro/member#), or UNKNOWN_BROADLINER.

For each line item extract: item_code, name (exact), canonical_name (expand abbreviations: CHIX→Chicken, BRST→Breast, BNLS→Boneless, SKNLS→Skinless, FRSH→Fresh, FROZ→Frozen, etc.), brand, pack_size, qty, unit, unit_price, total, category (PROTEIN/SEAFOOD/PRODUCE/DAIRY/DRY_GOODS/SPICES/GRAINS/BEVERAGE/SUPPLIES/OTHER), is_catch_weight, is_credit, is_fee, confidence.

Return ONLY valid JSON, no markdown:
{
  "invoices": [{
    "distributor": "SYSCO",
    "vendor": "Sysco Houston",
    "account_number": null,
    "invoice_number": "987654321",
    "date": "YYYY-MM-DD",
    "terms": null,
    "category": "wholesale",
    "doc_quality": "photo_clear",
    "parse_confidence": "high",
    "items": [{
      "item_code": "5593456",
      "name": "CHIX BRST BNLS SKNLS FRSH 40# AVG",
      "canonical_name": "Fresh Boneless Skinless Chicken Breast (avg 40 lb)",
      "brand": "Sysco Classic",
      "pack_size": "1/40 LB",
      "qty": 3,
      "unit": "CS",
      "unit_price": 89.50,
      "total": 268.50,
      "category": "PROTEIN",
      "is_catch_weight": true,
      "is_credit": false,
      "is_fee": false,
      "confidence": "high"
    }],
    "subtotal": 268.50,
    "tax": 0,
    "freight": null,
    "fuel_surcharge": null,
    "total": 268.50
  }]
}

CRITICAL: Extract EVERY line item. Never skip. Never invent data — use null if not visible.`;

      const ocrRes = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL_SMART ?? "claude-sonnet-4-6",
        max_tokens: 16000,
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            {
              type: isPDF ? "document" : "image",
              source: { type: "base64", media_type: mediaType, data: attachment.content },
            },
            { type: "text", text: BROADLINER_PROMPT },
          ] as any,
        }],
      });

      const rawText = ocrRes.content[0].type === "text" ? ocrRes.content[0].text : "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Claude returned no JSON");

      // Parse broadliner format: { invoices: [...] }
      const parsed = JSON.parse(jsonMatch[0]) as {
        invoices?: Array<{
          vendor?: string;
          distributor?: string;
          date?: string;
          invoice_number?: string;
          total?: number;
          category?: string;
          items?: Array<{
            name: string;
            canonical_name?: string;
            item_code?: string;
            brand?: string;
            pack_size?: string;
            qty: number;
            unit: string;
            unit_price: number;
            total: number;
            category: string;
            is_catch_weight?: boolean;
            is_credit?: boolean;
            is_fee?: boolean;
            confidence?: string;
          }>;
        }>;
      };

      const invoices = parsed.invoices ?? [];
      if (!invoices.length) {
        console.warn("[inbound-invoice] No invoices found in Claude response");
        processedCount++;
        continue;
      }

      for (const inv of invoices) {
        const detectedDate = inv.date ?? invoiceDate;

        // Map broadliner top-level category to CashCall delivery category
        const TOP_CATEGORY_MAP: Record<string, string> = {
          protein: "protein", produce: "produce", wholesale: "wholesale",
          dry_goods: "dry_goods", beverages: "beverages",
        };
        const category = TOP_CATEGORY_MAP[inv.category ?? ""] ?? "wholesale";

        const deliveryId = crypto.randomUUID();
        const { error: insErr } = await db.from("food_deliveries").insert({
          id: deliveryId,
          location_id: locationId,
          delivery_date: detectedDate,
          vendor: inv.vendor ?? "Unknown",
          invoice_number: inv.invoice_number ?? null,
          category,
          amount: inv.total ?? 0,
          notes: `Email from ${payload.from}: ${attachment.filename}`,
        });
        if (insErr) throw new Error(`food_deliveries: ${insErr.message}`);

        // ── Store line items ────────────────────────────────────────────────
        if (inv.items?.length) {
          const items = inv.items.map(li => ({
            name: li.name,
            qty: li.qty,
            unit: li.unit,
            unit_price: li.unit_price,
            total: li.total,
            category: li.category ?? "OTHER",
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let rows: any[] = items;
          try { rows = await normalizeLineItems(db, items as never); } catch { /* keep un-normalized names */ }
          const { error: liErr } = await db.from("invoice_line_items").insert(
            rows.map((row, idx) => {
              const src = inv.items![idx];
              return {
                food_delivery_id: deliveryId,
                name: row.name,
                qty: row.qty,
                unit: row.unit,
                unit_price: row.unit_price,
                total: row.total,
                category: row.category,
                item_id: row.item_id ?? null,
                // New broadliner fields (require migration)
                canonical_name: src?.canonical_name ?? null,
                item_code: src?.item_code ?? null,
                brand: src?.brand ?? null,
                pack_size: src?.pack_size ?? null,
                is_catch_weight: src?.is_catch_weight ?? false,
                is_credit: src?.is_credit ?? false,
                is_fee: src?.is_fee ?? false,
                ocr_confidence: src?.confidence ?? null,
              };
            })
          );
          if (liErr) console.warn("[inbound-invoice] line items insert failed:", liErr.message);
        }
      }

      processedCount++;
    } catch (err) {
      errors.push(`${attachment.filename}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    location_id: locationId,
    processed: processedCount,
    errors: errors.length ? errors : undefined,
  });
}
