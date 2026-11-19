export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

// ── POST /api/email/ingest ────────────────────────────────────────────────────
// Resend Inbound webhook for ingest@cashcall.io
//
// Two use cases:
//   1. User REPLIES to their daily digest with an invoice attachment  → OCR + save
//   2. User FORWARDS an invoice to ingest@cashcall.io                 → OCR + save
//
// User is identified by their FROM email address. Webhook secret required.
//
// Resend Inbound setup:
//   Dashboard → Domains → cashcall.io → Inbound
//   Webhook URL: https://cashcall.io/api/email/ingest
//   Header: x-webhook-secret = <INBOUND_EMAIL_WEBHOOK_SECRET>
//   DNS MX record: 10 inbound.resend.com  (at cashcall.io apex)
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ResendAttachment {
  filename: string;
  content: string;       // base64
  mimeType: string;      // or contentType depending on Resend version
  contentType?: string;
}

interface InboundPayload {
  from: string;          // "Name <email@domain.com>" or "email@domain.com"
  to: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: ResendAttachment[];
}

/** Extract bare email from "Name <email>" or plain "email" */
function parseEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

const OCR_PROMPT = `You are CashCall's invoice parsing engine. Extract all line items from this invoice.

Identify distributor: SYSCO (7-digit codes), US_FOODS (6-digit), PFG, GFS, RESTAURANT_DEPOT, or UNKNOWN.

Return ONLY valid JSON, no markdown:
{
  "invoices": [{
    "vendor": "Sysco Houston",
    "distributor": "SYSCO",
    "invoice_number": "987654321",
    "date": "YYYY-MM-DD or null",
    "total": 268.50,
    "category": "wholesale",
    "items": [{
      "name": "CHIX BRST BNLS SKNLS FRSH 40#",
      "canonical_name": "Fresh Boneless Skinless Chicken Breast (avg 40 lb)",
      "item_code": "5593456",
      "brand": "Sysco Classic",
      "pack_size": "1/40 LB",
      "qty": 3,
      "unit": "CS",
      "unit_price": 89.50,
      "total": 268.50,
      "category": "PROTEIN",
      "is_catch_weight": true,
      "is_credit": false,
      "confidence": "high"
    }]
  }]
}

Expand ALL abbreviations: CHIX→Chicken BRST→Breast BNLS→Boneless SKNLS→Skinless FRSH→Fresh
FROZ→Frozen GRND→Ground SHRIMP→Shrimp LTCE→Lettuce TOMT→Tomato MUSHRM→Mushroom
NEVER skip a line item. Use null for any field not visible.`;

export async function POST(req: NextRequest) {
  // ── Verify webhook secret ────────────────────────────────────────────────
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET ?? "";
  const sig =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-resend-signature") ??
    "";
  if (!secret || sig !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = await req.json() as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const senderEmail = parseEmail(payload.from);
  const subject = payload.subject ?? "(no subject)";
  const toAddress = Array.isArray(payload.to) ? payload.to[0] : payload.to;
  const today = new Date().toISOString().slice(0, 10);

  // ── Forward founder@cashcall.io to snamballa@gmail.com ───────────────────
  const toNorm = (toAddress ?? "").toLowerCase().trim();
  if (toNorm === "founder@cashcall.io") {
    try {
      // Uses the Resend REST API directly (same as the other routes) so the
      // build does not depend on the "resend" npm package.
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `founder@cashcall.io`,
          to: "snamballa@gmail.com",
          subject: `Fwd: ${subject}`,
          text: payload.text ?? payload.html ?? "(no body)",
          html: payload.html,
          reply_to: senderEmail,
        }),
      });
      if (!res.ok) {
        console.error("[email-forward] Resend returned", res.status, await res.text());
      }
    } catch (err) {
      console.error("[email-forward] Failed to forward founder email:", err);
    }
    return NextResponse.json({ ok: true, forwarded: "snamballa@gmail.com" });
  }

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // ── Log every ingest attempt ─────────────────────────────────────────────
  await db.from("email_ingest_log").insert({
    from_email: senderEmail,
    to_address: toAddress,
    subject,
    attachment_count: payload.attachments?.length ?? 0,
    received_at: new Date().toISOString(),
  }).then(() => {});   // non-blocking, don't fail if table missing yet

  // ── Identify user by sender email ────────────────────────────────────────
  let userRow: { id: string } | null = null;
  try {
    const { data } = await db
      .from("auth_users_view")
      .select("id")
      .eq("email", senderEmail)
      .single();
    userRow = data as { id: string } | null;
  } catch { /* view may not exist */ }

  // Fallback: query auth.users directly via RPC if view not available
  let userId: string | null = userRow?.id ?? null;
  if (!userId) {
    try {
      const { data: rpcUser } = await db
        .rpc("get_user_id_by_email", { p_email: senderEmail })
        .single<{ id: string }>();
      userId = (rpcUser as { id: string } | null)?.id ?? null;
    } catch { /* RPC may not exist */ }
  }

  if (!userId) {
    console.warn("[email-ingest] Unknown sender:", senderEmail);
    // Still return 200 to prevent Resend retries for unknown senders
    return NextResponse.json({ ok: true, note: "Sender not found — no action taken" });
  }

  // ── Get sender's primary active location ────────────────────────────────
  const { data: locations } = await db
    .from("locations")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  const locationId = locations?.[0]?.id ?? null;
  const locationName = locations?.[0]?.name ?? "Unknown";

  if (!locationId) {
    return NextResponse.json({ ok: true, note: "No locations found for this user" });
  }

  // ── Filter to PDF + image attachments ───────────────────────────────────
  const attachments = (payload.attachments ?? []).filter(a => {
    const ct = a.mimeType ?? a.contentType ?? "";
    return ct === "application/pdf" || ct.startsWith("image/");
  });

  if (attachments.length === 0) {
    // No attachment — could be a text reply to the digest
    // Log and acknowledge; future: parse sales numbers from reply body
    console.info("[email-ingest] No attachment from", senderEmail, "— subject:", subject);
    return NextResponse.json({ ok: true, processed: 0, note: "No invoice attachment found" });
  }

  let processedCount = 0;
  const errors: string[] = [];

  for (const attachment of attachments) {
    try {
      const ct = attachment.mimeType ?? attachment.contentType ?? "";
      const isPDF = ct === "application/pdf";
      const mediaType = isPDF
        ? "application/pdf"
        : (ct as "image/jpeg" | "image/png" | "image/webp" | "image/gif");

      // ── OCR via Claude ───────────────────────────────────────────────────
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
            { type: "text", text: OCR_PROMPT },
          ] as any,
        }],
      });

      const rawText = ocrRes.content[0].type === "text" ? ocrRes.content[0].text : "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in Claude response");

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
            confidence?: string;
          }>;
        }>;
      };

      for (const inv of (parsed.invoices ?? [])) {
        const deliveryId = crypto.randomUUID();
        const { error: insErr } = await db.from("food_deliveries").insert({
          id: deliveryId,
          location_id: locationId,
          delivery_date: inv.date ?? today,
          vendor: inv.vendor ?? "Unknown",
          invoice_number: inv.invoice_number ?? null,
          category: inv.category ?? "wholesale",
          amount: inv.total ?? 0,
          notes: `Via ingest@cashcall.io — from ${senderEmail} — ${attachment.filename}`,
        });
        if (insErr) throw new Error(`food_deliveries: ${insErr.message}`);

        if (inv.items?.length) {
          const { error: liErr } = await db.from("invoice_line_items").insert(
            inv.items.map(li => ({
              food_delivery_id: deliveryId,
              name: li.name,
              qty: li.qty,
              unit: li.unit,
              unit_price: li.unit_price,
              total: li.total,
              category: li.category ?? "OTHER",
              canonical_name: li.canonical_name ?? null,
              item_code: li.item_code ?? null,
              brand: li.brand ?? null,
              pack_size: li.pack_size ?? null,
              is_catch_weight: li.is_catch_weight ?? false,
              is_credit: li.is_credit ?? false,
              ocr_confidence: li.confidence ?? null,
            }))
          );
          if (liErr) console.warn("[email-ingest] line items:", liErr.message);
        }
      }

      processedCount++;
    } catch (err) {
      errors.push(`${attachment.filename}: ${(err as Error).message}`);
    }
  }

  console.info(`[email-ingest] ${senderEmail} → ${locationName}: processed ${processedCount}/${attachments.length}`);

  return NextResponse.json({
    ok: true,
    user: senderEmail,
    location: locationName,
    processed: processedCount,
    errors: errors.length ? errors : undefined,
  });
}
