import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Accounts that never expire
const WHITELIST = new Set(["hbk19403@gmail.com", "testcashcall@cashcall.io"]);

// Public paths — no auth required (landing page + marketing)
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/trial",
  "/signup",
  "/reset-password",
  "/about",
  "/press",
  "/investors",
  "/security",
  "/manual",
  "/sandbox",
  "/clover",           // Clover App Market install landing page (unauthenticated merchants arrive here)
  "/api/chat",
  "/api/trial/request",
  "/api/track",
  "/api/invites/validate", // trial page checks an invite key before the visitor has an account
  "/api/team/accept",
  "/api/billing/webhook", // Stripe webhook — no session, has its own signature check
];

// Machine-called routes (Vercel cron, and the digest route the WhatsApp cron calls). They have no
// login session, so they are let through only when they carry the cron secret; each route checks
// the secret again itself.
const CRON_PATHS = [
  "/api/reports/scheduled",
  "/api/whatsapp",            // daily AI digest (scheduled)
  "/api/digest",              // digest text, fetched by /api/whatsapp with x-cron-key
  "/api/notify/weekly",
  "/api/notify/daily",        // numbers brief: not scheduled, kept for manual runs
  "/api/pos/clover/sync",
  "/api/cron/rollup-prices",
];

// Inbound email webhook paths. Closed unless INBOUND_EMAIL_WEBHOOK_SECRET is set and matches.
const INBOUND_WEBHOOK_PATHS = [
  "/api/invoices/inbound",   // loc-{slug}@invoices.cashcall.io  — per-location routing
  "/api/email/ingest",       // ingest@cashcall.io               — user-identified by FROM email
];

function hasCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-cron-key") === secret
  );
}

// Paths that skip the trial-expiry check (admin and public routes)
const TRIAL_BYPASS = [
  "/admin",
  "/trial-expired",
  "/trial",
  "/signup",
  "/login",
  "/reset-password",
  "/about",
  "/press",
  "/investors",
  "/security",
  "/manual",
  "/sandbox",
  "/upgrade",          // pricing page — expired users must reach this
  "/billing",          // Stripe success page
  "/api/",
  "/_next",
  "/icons",
  "/manifest",
  "/favicon",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const path = request.nextUrl.pathname;

  if (CRON_PATHS.includes(path) && hasCronSecret(request)) {
    return NextResponse.next({ request });
  }

  if (INBOUND_WEBHOOK_PATHS.includes(path)) {
    const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
    const sig = request.headers.get("x-webhook-secret") ?? request.headers.get("x-resend-signature");
    if (secret && sig === secret) return NextResponse.next({ request });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = PUBLIC_PATHS.includes(path) || path === "/login" || path.startsWith("/clover");

  // ── Auth gate ────────────────────────────────────────────────────────
  // Allow unauthenticated visitors on public/marketing pages
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Logged-in user hitting /login → send to dashboard
  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!user) return supabaseResponse;

  // ── Whitelisted accounts (admin + demo) — skip trial check ──────────
  if (WHITELIST.has(user.email ?? "")) return supabaseResponse;

  // ── Skip trial check for admin / public / API routes ─────────────────
  if (TRIAL_BYPASS.some((p) => path.startsWith(p))) return supabaseResponse;

  // ── Trial expiry check ───────────────────────────────────────────────
  const { data: invite } = await supabase
    .from("trial_invites")
    .select("expires_at")
    .eq("email", user.email!)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (invite?.expires_at && new Date(invite.expires_at) < new Date()) {
    // Check for an active paid subscription
    const { data: sub } = await supabase
      .from("client_subscriptions")
      .select("status, subscription_ends_at")
      .eq("email", user.email!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isActive =
      sub?.status === "active" &&
      (!sub.subscription_ends_at || new Date(sub.subscription_ends_at) > new Date());

    if (!isActive) {
      return NextResponse.redirect(new URL("/trial-expired", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
