export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
// Uses Resend REST API directly (no SDK dependency needed)
async function sendEmail(opts: {
  from: string; to: string; replyTo?: string; subject: string; html: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const json = await res.json() as { id?: string };
  return json.id ?? null;
}

// POST /api/ordering/submit
// Body: {
//   location_id: string,
//   vendor_name: string,
//   items: Array<{ item_name, item_code, pack_size, brand, quantity, unit, last_unit_price, notes, source_line_item_id? }>,
//   notes?: string,
//   source_food_delivery_id?: string
// }
//
// 1. Creates order_draft + order_draft_items
// 2. Looks up vendor_contact for this location + vendor
// 3. Sends order email via Resend
// 4. Updates order_draft.status = 'submitted'
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { location_id, vendor_name, items, notes, source_food_delivery_id } = body;

  if (!location_id || !vendor_name || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "location_id, vendor_name, items required" }, { status: 400 });
  }

  // Verify ownership
  const { data: loc } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", location_id)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Look up vendor contact
  const { data: vendorContact } = await supabase
    .from("vendor_contacts")
    .select("*")
    .eq("location_id", location_id)
    .ilike("vendor_name", vendor_name)
    .single();

  // Use service client for insert (bypasses RLS quirks on insert with joins)
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Create the order draft
  const { data: draft, error: draftError } = await db
    .from("order_drafts")
    .insert({
      location_id,
      vendor_name,
      vendor_contact_id: vendorContact?.id ?? null,
      status: "draft",
      notes: notes ?? null,
      source_food_delivery_id: source_food_delivery_id ?? null,
      submission_method: vendorContact ? "email" : "pdf",
    })
    .select()
    .single();

  if (draftError || !draft) {
    return NextResponse.json({ error: draftError?.message ?? "Failed to create draft" }, { status: 500 });
  }

  // Insert line items
  const lineItems = items.map((item: {
    item_name: string;
    item_code?: string;
    pack_size?: string;
    brand?: string;
    quantity: number;
    unit?: string;
    last_unit_price?: number;
    notes?: string;
    source_line_item_id?: string;
  }) => ({
    order_draft_id: draft.id,
    item_name: item.item_name,
    item_code: item.item_code ?? null,
    pack_size: item.pack_size ?? null,
    brand: item.brand ?? null,
    quantity: item.quantity,
    unit: item.unit ?? null,
    last_unit_price: item.last_unit_price ?? null,
    notes: item.notes ?? null,
    source_line_item_id: item.source_line_item_id ?? null,
  }));

  const { error: itemsError } = await db
    .from("order_draft_items")
    .insert(lineItems);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // If no vendor contact, return draft for PDF download
  if (!vendorContact) {
    return NextResponse.json({
      ok: true,
      draft_id: draft.id,
      status: "draft",
      message: "Order saved. No vendor contact found — download PDF to submit manually.",
      download_url: `/api/ordering/pdf/${draft.id}`,
    });
  }

  // Send order email via Resend
  const orderTable = items.map((item: {
    item_name: string;
    item_code?: string;
    pack_size?: string;
    brand?: string;
    quantity: number;
    unit?: string;
    last_unit_price?: number;
    notes?: string;
  }) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${item.item_name}${item.brand ? ` — ${item.brand}` : ""}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${item.item_code ?? "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${item.pack_size ?? "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:bold">${item.quantity}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${item.last_unit_price ? `$${item.last_unit_price.toFixed(2)}` : "—"}</td>
    </tr>
  `).join("");

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:20px">
  <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:20px">
    <h2 style="margin:0 0 4px;color:#1a1a1a">Purchase Order — ${loc.name}</h2>
    <p style="margin:0;color:#666;font-size:14px">Order #${draft.id.slice(0, 8).toUpperCase()} · ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
  </div>

  ${vendorContact.account_number ? `<p style="font-size:14px"><strong>Account #:</strong> ${vendorContact.account_number}</p>` : ""}

  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f1f3f5">
        <th style="padding:8px 12px;text-align:left">Item</th>
        <th style="padding:8px 12px;text-align:center">Code</th>
        <th style="padding:8px 12px;text-align:center">Pack Size</th>
        <th style="padding:8px 12px;text-align:center">Qty</th>
        <th style="padding:8px 12px;text-align:right">Last Price</th>
      </tr>
    </thead>
    <tbody>${orderTable}</tbody>
  </table>

  ${notes ? `<p style="margin-top:16px;font-size:14px"><strong>Notes:</strong> ${notes}</p>` : ""}

  <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
  <p style="font-size:12px;color:#999">
    This order was placed via CashCall.io on behalf of ${loc.name}.
    Please confirm receipt by replying to this email.
    Questions? Contact the restaurant directly.
  </p>
</body>
</html>`;

  let emailMessageId: string | null = null;
  try {
    emailMessageId = await sendEmail({
      from: `${loc.name} via CashCall <orders@cashcall.io>`,
      to: vendorContact.rep_email,
      replyTo: user.email ?? undefined,
      subject: `Purchase Order — ${loc.name} — ${new Date().toLocaleDateString("en-US")}`,
      html: emailHtml,
    });
  } catch (emailErr) {
    console.error("[ordering/submit] Email send failed:", emailErr);
    // Don't fail the whole request — mark as draft so user can retry
    await db
      .from("order_drafts")
      .update({ status: "draft", notes: "Email send failed — please retry" })
      .eq("id", draft.id);

    return NextResponse.json({
      ok: false,
      draft_id: draft.id,
      error: "Order saved but email failed to send. Please try again or download PDF.",
      download_url: `/api/ordering/pdf/${draft.id}`,
    }, { status: 207 });
  }

  // Update draft to submitted
  await db
    .from("order_drafts")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      email_message_id: emailMessageId,
    })
    .eq("id", draft.id);

  return NextResponse.json({
    ok: true,
    draft_id: draft.id,
    status: "submitted",
    sent_to: vendorContact.rep_email,
    message: `Order sent to ${vendorContact.rep_name ?? vendorContact.rep_email} at ${vendor_name}.`,
  });
}
