import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ── POST /api/labor/connect — save labor scheduler credentials ────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, provider, api_key, location_code } =
    await req.json() as {
      location_id: string;
      provider: "7shifts" | "hotschedules" | "homebase" | "deputy";
      api_key: string;
      location_code: string;
    };

  if (!location_id || !provider || !api_key || !location_code) {
    return NextResponse.json({ error: "location_id, provider, api_key, location_code required" }, { status: 400 });
  }

  const { data: loc } = await supabase.from("locations")
    .select("id").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { error } = await db.from("labor_scheduler_connections").upsert({
    location_id, provider, api_key, location_code,
    connected_at: new Date().toISOString(),
    sync_status: "pending",
  }, { onConflict: "location_id,provider" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { location_id, provider } = await req.json() as { location_id: string; provider: string };

  const { data: loc } = await supabase.from("locations")
    .select("id").eq("id", location_id).eq("user_id", user.id).single();
  if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  await db.from("labor_scheduler_connections")
    .delete().eq("location_id", location_id).eq("provider", provider);

  return NextResponse.json({ ok: true });
}
