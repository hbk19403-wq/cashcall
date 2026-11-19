import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["hbk19403@gmail.com", "testcashcall@cashcall.io"];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await admin
    .from("client_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { email, user_id, status, monthly_amount, notes, subscription_starts_at, subscription_ends_at, payment_method } = body;

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Upsert by email
  const { data: existing } = await admin
    .from("client_subscriptions")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let result;
  if (existing) {
    result = await admin
      .from("client_subscriptions")
      .update({
        user_id,
        status,
        monthly_amount,
        notes,
        subscription_starts_at,
        subscription_ends_at,
        payment_method,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .select()
      .single();
  } else {
    result = await admin
      .from("client_subscriptions")
      .insert({
        email,
        user_id,
        status: status || "trial",
        monthly_amount: monthly_amount || 0,
        notes,
        subscription_starts_at,
        subscription_ends_at,
        payment_method,
        trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, subscription: result.data });
}
