/**
 * GET /api/price-spikes
 * Returns top commodity price spikes/drops across all locations for the authenticated user.
 * Compares the most-recent invoice unit price for each item vs its 3-month historical average.
 *
 * Response: { spikes: SpikeAlert[], updatedAt: string }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface SpikeAlert {
  name: string;
  category: string;
  locationName: string;
  locationId: string;
  latestPrice: number;
  avg3mo: number;
  changePct: number;        // positive = spike, negative = drop
  unit: string;
  vendor: string;
  latestDate: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all user's CashCall locations
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("app", "cashcall");

  if (!locations?.length) return NextResponse.json({ spikes: [], updatedAt: new Date().toISOString() });

  const locationIds = locations.map(l => l.id);
  const locationNameMap: Record<string, string> = Object.fromEntries(locations.map(l => [l.id, l.name]));

  // 7 months of deliveries
  const since = new Date();
  since.setMonth(since.getMonth() - 7);
  const cutoff = since.toISOString().slice(0, 10);

  const { data: deliveries } = await supabase
    .from("food_deliveries")
    .select("id, delivery_date, vendor, location_id")
    .in("location_id", locationIds)
    .gte("delivery_date", cutoff)
    .order("delivery_date");

  if (!deliveries?.length) return NextResponse.json({ spikes: [], updatedAt: new Date().toISOString() });

  const deliveryIds = deliveries.map(d => d.id);
  const deliveryMap: Record<string, { date: string; vendor: string; locationId: string }> = {};
  for (const d of deliveries) deliveryMap[d.id] = { date: d.delivery_date, vendor: d.vendor, locationId: d.location_id };

  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("name, unit_price, unit, category, food_delivery_id")
    .in("food_delivery_id", deliveryIds)
    .not("unit_price", "is", null)
    .gt("unit_price", 0);

  if (!lineItems?.length) return NextResponse.json({ spikes: [], updatedAt: new Date().toISOString() });

  // Group by (location, item_name)
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMoCutoff = threeMonthsAgo.toISOString().slice(0, 10);

  type ItemKey = string; // `${locationId}::${itemNameLower}`
  const latestByKey: Record<ItemKey, { price: number; unit: string; vendor: string; date: string; locationId: string; category: string; displayName: string }> = {};
  const histByKey: Record<ItemKey, number[]> = {};

  for (const li of lineItems) {
    const d = deliveryMap[li.food_delivery_id];
    if (!d) continue;
    const key: ItemKey = `${d.locationId}::${li.name.toLowerCase().trim()}`;
    const price = Number(li.unit_price);

    if (d.date >= threeMoCutoff && d.date.slice(0, 7) < thisMonth) {
      // Historical: 3 months before this month
      (histByKey[key] ??= []).push(price);
    }

    // Latest price for this item at this location
    if (!latestByKey[key] || d.date > latestByKey[key].date) {
      latestByKey[key] = {
        price, unit: li.unit ?? "", vendor: d.vendor,
        date: d.date, locationId: d.locationId,
        category: li.category ?? "",
        displayName: li.name.trim(),
      };
    }
  }

  const SPIKE_THRESHOLD = 8;   // alert if >8% above 3-month avg
  const DROP_THRESHOLD  = -8;  // alert if >8% below 3-month avg
  const MIN_HISTORY = 2;       // need at least 2 historical data points

  const spikes: SpikeAlert[] = [];

  for (const [key, latest] of Object.entries(latestByKey)) {
    const hist = histByKey[key];
    if (!hist || hist.length < MIN_HISTORY) continue;

    // Median-filter to remove outliers in historical data
    const sorted = [...hist].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const clean = hist.filter(p => p <= median * 5 && p >= median * 0.2);
    if (clean.length < MIN_HISTORY) continue;

    const avg3mo = clean.reduce((s, v) => s + v, 0) / clean.length;
    const changePct = ((latest.price - avg3mo) / avg3mo) * 100;

    if (changePct >= SPIKE_THRESHOLD || changePct <= DROP_THRESHOLD) {
      const displayName = latest.displayName
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");

      spikes.push({
        name: displayName,
        category: latest.category,
        locationId: latest.locationId,
        locationName: locationNameMap[latest.locationId] ?? "Unknown",
        latestPrice: latest.price,
        avg3mo,
        changePct,
        unit: latest.unit,
        vendor: latest.vendor,
        latestDate: latest.date,
      });
    }
  }

  // Sort: biggest absolute change first
  spikes.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  return NextResponse.json({ spikes: spikes.slice(0, 20), updatedAt: new Date().toISOString() });
}
