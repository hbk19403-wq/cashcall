import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/ordering/items?locationId=xxx&vendor=Sysco&limit=50
// Returns the most recent line items for a vendor, deduplicated by item_code / canonical_name.
// Used to populate the reorder screen.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("locationId");
  const vendor = req.nextUrl.searchParams.get("vendor");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100"), 200);

  if (!locationId) return NextResponse.json({ error: "locationId required" }, { status: 400 });

  // Verify ownership
  const { data: loc } = await supabase
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .eq("user_id", user.id)
    .single();
  if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pull recent invoice line items joined with food_deliveries
  // Exclude credits, fees, low-confidence items
  let query = supabase
    .from("invoice_line_items")
    .select(`
      id,
      name,
      canonical_name,
      raw_description,
      item_code,
      brand,
      pack_size,
      qty,
      unit,
      unit_price,
      total,
      category,
      ocr_confidence,
      is_catch_weight,
      food_delivery_id,
      food_deliveries!inner (
        id,
        location_id,
        delivery_date,
        vendor,
        invoice_number
      )
    `)
    .eq("food_deliveries.location_id", locationId)
    .eq("is_credit", false)
    .eq("is_fee", false)
    .not("unit_price", "is", null)
    .order("food_deliveries(delivery_date)", { ascending: false })
    .limit(limit * 3); // over-fetch before dedup

  if (vendor) {
    query = query.ilike("food_deliveries.vendor", `%${vendor}%`);
  }

  const { data: rawItems, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate: for each item_code (or canonical_name), keep the most recent occurrence
  const seen = new Map<string, typeof rawItems[0]>();
  for (const item of (rawItems ?? [])) {
    const key = item.item_code
      ? `code:${item.item_code}`
      : `name:${(item.canonical_name ?? item.name).toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }

  const items = Array.from(seen.values()).slice(0, limit);

  return NextResponse.json({ items });
}
