import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { key } = await req.json().catch(() => ({})) as { key?: string };
  if (!key) return NextResponse.json({ ok: false, error: "No key" }, { status: 400 });

  // The caller must be signed in; the invite is marked as used by them.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  // Mark as used with the service role, and only if the invite is still unused and not expired.
  // (Signed-in users have no direct write access to trial_invites.)
  const db = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const now = new Date().toISOString();
  const { error } = await db
    .from("trial_invites")
    .update({ used_by: user.id, used_at: now })
    .eq("key", key)
    .is("used_at", null)
    .gt("expires_at", now);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
