import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Check if profile already exists
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("user_id, role")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      return NextResponse.json({ ok: true, role: existing.role, created: false });
    }

    // Create a default owner profile (RLS allows authenticated users to insert their own row)
    const username = (user.user_metadata?.full_name as string | undefined)
      || user.email?.split("@")[0]
      || "Owner";

    const { error: insertError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: user.id,
        role: "owner",
        username,
        location_id: null,
      });

    if (insertError) {
      console.error("[setup-profile] insert error:", insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, role: "owner", created: true });
  } catch (e) {
    console.error("[setup-profile]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
