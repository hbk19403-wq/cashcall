import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { name, state, tax_rate, address, location_type } = body;

    if (!name || !state) {
      return NextResponse.json({ ok: false, error: "Name and state are required" }, { status: 400 });
    }

    // Idempotency: return existing location if same name+state already exists for this user
    const { data: existing } = await supabase
      .from("locations")
      .select("id")
      .eq("user_id", user.id)
      .eq("app", "cashcall")
      .ilike("name", name.trim())
      .eq("state", state.trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, location_id: existing.id, existing: true });
    }

    // Auto-generate a short code from the location name
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .split(/\s+/)
      .map((w: string) => w[0])
      .join("")
      .substring(0, 4) || name.substring(0, 3).toUpperCase();

    const { data, error } = await supabase
      .from("locations")
      .insert({
        name: name.trim(),
        code,
        state: state.trim(),
        tax_rate: parseFloat(String(tax_rate)) || 0,
        address: address?.trim() || null,
        app: "cashcall",
        user_id: user.id,
        location_type: location_type === "bar_restaurant" ? "bar_restaurant" : "restaurant",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[locations/create]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const locationId = data.id;

    // Create email ingest address: loc-{slug}@invoices.cashcall.io
    // slug = sanitised location name, max 24 chars, plus 6-char hex suffix for uniqueness
    const rawSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 18);
    const suffix = Math.random().toString(16).slice(2, 8);
    const emailSlug = `loc-${rawSlug}-${suffix}`;

    // Insert — if invoice_email_addresses table doesn't exist yet, skip gracefully
    try {
      await supabase.from("invoice_email_addresses").insert({
        location_id: locationId,
        email_slug: emailSlug,
      });
    } catch {
      // Table may not exist in older migrations — non-fatal
    }

    return NextResponse.json({ ok: true, location_id: locationId, email_slug: emailSlug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
