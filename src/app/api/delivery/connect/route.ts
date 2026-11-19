import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── POST /api/delivery/connect — save delivery platform credentials ────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, provider, api_key, store_id } =
    await req.json() as {
      location_id: string;
      provider: "doordash" | "ubereats" | "grubhub";
      api_key: string;
      store_id: string;
    };

  if (!location_id || !provider || !api_key || !store_id) {
    return NextResponse.json({ error: "location_id, provider, api_key, store_id required" }, { status: 400 });
  }
  if (!["doordash", "ubereats", "grubhub"].includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Verify location ownership
  const { data: loc } = await supabase.from("locations")
    .select("id").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await db.from("delivery_connections").upsert({
    location_id,
    provider,
    api_key,
    store_id,
    connected_at: new Date().toISOString(),
  }, { onConflict: "location_id,provider" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/delivery/connect — remove connection ─────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, provider } =
    await req.json() as { location_id: string; provider: string };

  const { data: loc } = await supabase.from("locations")
    .select("id").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  await db.from("delivery_connections")
    .delete().eq("location_id", location_id).eq("provider", provider);

  return NextResponse.json({ ok: true });
}
