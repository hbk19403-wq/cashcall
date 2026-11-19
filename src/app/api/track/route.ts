export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// Anonymous marketing events: which public page was viewed and which post sent the visitor.
// No IP address, no user agent, no email is stored.

const EVENTS = new Set(["page_view", "trial_request", "cta_click"]);
const PATHS = new Set(["/", "/trial", "/sandbox", "/about", "/press", "/investors", "/security", "/manual"]);
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;

function clean(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(req: NextRequest) {
  try {
    if (BOT.test(req.headers.get("user-agent") || "")) return new NextResponse(null, { status: 204 });

    const body = await req.json().catch(() => null);
    if (!body || !EVENTS.has(body.event) || !PATHS.has(body.path)) {
      return new NextResponse(null, { status: 204 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return new NextResponse(null, { status: 204 });

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, key);
    const { error } = await admin.from("marketing_events").insert({
      event: body.event,
      path: body.path,
      session_id: clean(body.session_id, 40),
      label: clean(body.label, 60),
      utm_source: clean(body.utm_source, 120),
      utm_medium: clean(body.utm_medium, 120),
      utm_campaign: clean(body.utm_campaign, 120),
      utm_content: clean(body.utm_content, 120),
      referrer: clean(body.referrer, 300),
      landing_path: clean(body.landing_path, 120),
    });
    if (error) console.error("[track] insert failed:", error.message);
  } catch (err) {
    console.error("[track] error:", err);
  }
  // Always 204: tracking must never surface an error to a visitor.
  return new NextResponse(null, { status: 204 });
}
