export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Maghil Partner Reporting API — API key auth (no OAuth)
// Endpoint: POST https://maghil-partner-reporting-gateway-681142215919.us-east1.run.app/v1/stores/{STORE_ID}/reports
// Header:   x-api-key: {API_KEY}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { location_id?: string; store_id?: string; api_key?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const { location_id, store_id, api_key } = body;
  if (!location_id?.trim()) return NextResponse.json({ error: "location_id required" }, { status: 400 });
  if (!store_id?.trim())    return NextResponse.json({ error: "store_id required"    }, { status: 400 });
  if (!api_key?.trim())     return NextResponse.json({ error: "api_key required"     }, { status: 400 });

  // Verify user owns this location (or is using a shared service-role insert for seeding)
  const { data: loc } = await supabase.from("locations").select("id")
    .eq("id", location_id).eq("user_id", user.id).maybeSingle();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  // Validate the credentials by making a test API call
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  try {
    const testRes = await fetch(
      `https://maghil-partner-reporting-gateway-681142215919.us-east1.run.app/v1/stores/${store_id}/reports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": api_key },
        body: JSON.stringify({ startDate: yesterday, endDate: yesterday }),
      }
    );
    if (testRes.status === 401 || testRes.status === 403) {
      return NextResponse.json({ error: "Invalid API key — please check your Maghil credentials" }, { status: 400 });
    }
    // 404 for a store ID that exists but has no data on that day is acceptable
  } catch {
    // Network error — don't block the save, let the user save and sync later
  }

  const { error: upsertErr } = await supabase.from("pos_connections").upsert({
    location_id,
    provider: "maghil",
    merchant_id: store_id.trim(),   // store_id goes into merchant_id column
    access_token: api_key.trim(),   // api_key goes into access_token column
    environment: "production",
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id,provider" });

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, store_id: store_id.trim() });
}
