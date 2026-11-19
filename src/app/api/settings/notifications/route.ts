import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — fetch current notification prefs for the logged-in user */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("notification_prefs")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prefs: data ?? null });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST — upsert notification prefs for the logged-in user */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      digest_email,
      whatsapp_number,
      whatsapp_provider,
      digest_enabled,
      digest_time,
      report_schedule,
      report_day,
      report_format,
      report_email,
    } = body;

    const { error } = await supabase.from("notification_prefs").upsert({
      user_id: user.id,
      digest_email: digest_email ?? null,
      whatsapp_number: whatsapp_number ?? null,
      whatsapp_provider: whatsapp_provider ?? "twilio",
      digest_enabled: digest_enabled ?? false,
      digest_time: digest_time ?? "06:00",
      report_schedule: report_schedule ?? "off",
      report_day: report_day ?? 1,
      report_format: report_format ?? "email",
      report_email: report_email ?? null,
    }, { onConflict: "user_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
