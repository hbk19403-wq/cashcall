export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });

// Price IDs — set these after creating products in Stripe dashboard
// or via STRIPE_PRICE_STARTER / STRIPE_PRICE_GROWTH env vars
const PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER ?? "",   // $99/mo — 1 location
  growth:  process.env.STRIPE_PRICE_GROWTH  ?? "",   // $199/mo — up to 5 locations
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan = "starter" } = await req.json() as { plan?: "starter" | "growth" };
  const priceId = PRICES[plan];
  if (!priceId) {
    return NextResponse.json({ error: `Stripe price ID not configured for plan "${plan}". Set STRIPE_PRICE_${plan.toUpperCase()} in your env vars.` }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? "https://cashcall.io";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan },
    subscription_data: { metadata: { user_id: user.id, plan } },
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/upgrade?cancelled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
