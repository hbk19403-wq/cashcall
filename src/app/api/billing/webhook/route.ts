export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Service-role Supabase client for writing subscription data
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
  }

  const supabase = adminSupabase();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const userId   = session.metadata?.user_id;
      const plan     = session.metadata?.plan ?? "starter";
      const email    = session.customer_email;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;

      if (!userId) break;

      await supabase.from("client_subscriptions").upsert({
        user_id:                userId,
        email,
        status:                 "active",
        plan,
        monthly_amount:         plan === "growth" ? 199 : 99,
        payment_method:         "stripe",
        stripe_customer_id:     stripeCustomerId,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        subscription_starts_at: new Date().toISOString(),
        updated_at:             new Date().toISOString(),
      }, { onConflict: "user_id" });

      console.log(`[billing/webhook] activated subscription for user ${userId}`);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;

      const status = sub.status === "active" ? "active"
                   : sub.status === "past_due" ? "past_due"
                   : sub.cancel_at_period_end ? "canceling"
                   : "inactive";

      await supabase.from("client_subscriptions").update({
        status,
        updated_at: new Date().toISOString(),
        ...(sub.cancel_at_period_end && { trial_expires_at: new Date(sub.current_period_end * 1000).toISOString() }),
      }).eq("user_id", userId);

      console.log(`[billing/webhook] subscription updated for user ${userId}: ${status}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;

      await supabase.from("client_subscriptions").update({
        status:     "inactive",
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);

      console.log(`[billing/webhook] subscription canceled for user ${userId}`);
      break;
    }

    default:
      // Unhandled event types are ignored
      break;
  }

  return NextResponse.json({ received: true });
}
