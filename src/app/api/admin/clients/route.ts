import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["hbk19403@gmail.com", "testcashcall@cashcall.io"];

export async function GET() {
  // 1. Auth check — only admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !ADMIN_EMAILS.includes(user.email ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // 2. Service role client to read auth.users
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. All auth users
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  const users = authData.users;
  const userIds = users.map((u) => u.id);

  // 4. All locations for cashcall app
  const { data: locations } = await admin
    .from("locations")
    .select("id, name, state, address, user_id, created_at, app")
    .eq("app", "cashcall");

  // 5. User profiles
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("user_id, username, role");

  // 6. Activity counts per location
  const { data: salesCounts } = await admin
    .from("daily_sales")
    .select("location_id");

  const { data: foodCounts } = await admin
    .from("food_deliveries")
    .select("location_id");

  // 7. Trial invites (potential clients pipeline)
  const { data: invites } = await admin
    .from("trial_invites")
    .select("id, key, label, email, used_by, used_at, expires_at, created_at")
    .order("created_at", { ascending: false });

  // 7b. Access requests
  const { data: accessRequests } = await admin
    .from("access_requests")
    .select("id, name, email, restaurant_name, locations, status, notes, created_at, reviewed_at, invite_key")
    .order("created_at", { ascending: false });

  // Build lookup maps
  const locsByUser: Record<string, typeof locations> = {};
  for (const loc of locations ?? []) {
    if (!locsByUser[loc.user_id]) locsByUser[loc.user_id] = [];
    locsByUser[loc.user_id]!.push(loc);
  }

  const profileByUser: Record<string, { username: string; role: string }> = {};
  for (const p of profiles ?? []) {
    profileByUser[p.user_id] = { username: p.username, role: p.role };
  }

  const salesByLoc: Record<string, number> = {};
  for (const s of salesCounts ?? []) {
    salesByLoc[s.location_id] = (salesByLoc[s.location_id] ?? 0) + 1;
  }

  const foodByLoc: Record<string, number> = {};
  for (const f of foodCounts ?? []) {
    foodByLoc[f.location_id] = (foodByLoc[f.location_id] ?? 0) + 1;
  }

  // 8. Build clients list (exclude demo/test accounts)
  const EXCLUDED = ["hbk19403@gmail.com", "testcashcall@cashcall.io", "testcashcall123@gmail.com"];
  const clients = users
    .filter((u) => !EXCLUDED.includes(u.email ?? ""))
    .map((u) => {
      const userLocs = locsByUser[u.id] ?? [];
      const totalSales = userLocs.reduce((sum, l) => sum + (salesByLoc[l.id] ?? 0), 0);
      const totalFood = userLocs.reduce((sum, l) => sum + (foodByLoc[l.id] ?? 0), 0);
      const profile = profileByUser[u.id];

      return {
        id: u.id,
        email: u.email,
        name: profile?.username ?? null,
        joined_at: u.created_at,
        last_sign_in: u.last_sign_in_at ?? null,
        email_confirmed: !!u.email_confirmed_at,
        locations: userLocs.map((l) => ({
          id: l.id,
          name: l.name,
          state: l.state,
          address: l.address,
          created_at: l.created_at,
          sales_entries: salesByLoc[l.id] ?? 0,
          food_entries: foodByLoc[l.id] ?? 0,
        })),
        total_sales_entries: totalSales,
        total_food_entries: totalFood,
        status: userLocs.length === 0 ? "signed_up" : totalSales > 0 ? "active" : "onboarded",
      };
    })
    .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime());

  // 9. Invite pipeline
  const pipeline = (invites ?? []).map((inv) => ({
    ...inv,
    status: inv.used_at ? "converted" : new Date(inv.expires_at) < new Date() ? "expired" : "pending",
  }));

  // 10. Subscriptions
  const { data: subscriptions } = await admin
    .from("client_subscriptions")
    .select("*")
    .order("created_at", { ascending: false });

  // Merge subscription data into clients
  const subByEmail: Record<string, { status: string; monthly_amount: number; subscription_ends_at: string | null; notes: string | null }> = {};
  for (const s of subscriptions ?? []) {
    subByEmail[s.email] = {
      status: s.status,
      monthly_amount: s.monthly_amount ?? 0,
      subscription_ends_at: s.subscription_ends_at ?? null,
      notes: s.notes ?? null,
    };
  }

  // Attach subscription info + trial expiry from invites
  const inviteByEmail: Record<string, string> = {};
  for (const inv of invites ?? []) {
    if (inv.email && inv.expires_at) inviteByEmail[inv.email] = inv.expires_at;
  }

  const clientsWithBilling = clients.map((c) => ({
    ...c,
    subscription: subByEmail[c.email ?? ""] ?? null,
    trial_expires_at: inviteByEmail[c.email ?? ""] ?? null,
  }));

  return NextResponse.json({ clients: clientsWithBilling, pipeline, subscriptions: subscriptions ?? [], accessRequests: accessRequests ?? [] });
}
