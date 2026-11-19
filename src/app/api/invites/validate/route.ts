import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Called by the trial page before the visitor has an account. It looks up ONE invite by its exact
// key using the service role, so the trial_invites table does not need to be readable by the public.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ valid: false, error: "No key provided" }, { status: 400 });
  if (key.length > 200) return NextResponse.json({ valid: false, error: "Invalid key" }, { status: 404 });

  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await db
    .from("trial_invites")
    .select("label, email, used_at, expires_at")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ valid: false, error: "Invalid key" }, { status: 404 });
  if (data.used_at) return NextResponse.json({ valid: false, error: "This invite has already been used" }, { status: 410 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ valid: false, error: "This invite has expired" }, { status: 410 });

  return NextResponse.json({ valid: true, label: data.label, email: data.email });
}
