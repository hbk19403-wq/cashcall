import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPLSummary } from "@/lib/fetchPL";
import CashCallHeader from "@/app/components/CashCallHeader";
import RollupClient, { LocationMetrics, MonthTrend } from "./RollupClient";

function getMonthString(offsetMonths: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString().slice(0, 7) + "-01";
}

function monthLabel(monthStr: string): string {
  const d = new Date(monthStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export default async function RollupPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load user profile for header
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, role")
    .eq("user_id", user.id)
    .single();

  // Fetch all locations for this user
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, code, state")
    .eq("app", "cashcall")
    .eq("user_id", user.id)
    .order("name");

  const locationList = locations ?? [];

  // Build 6-month window: current month + 5 prior months
  const months = Array.from({ length: 6 }, (_, i) => getMonthString(i - 5));
  const currentMonth = months[months.length - 1];

  if (locationList.length === 0) {
    return (
      <div className="min-h-screen" style={{ background: "#060b18" }}>
        <CashCallHeader
          username={profile?.full_name ?? user.email ?? ""}
          role={profile?.role ?? "owner"}
        />
        <main className="max-w-7xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-400">No locations found. Add a location to see your roll-up.</p>
        </main>
      </div>
    );
  }

  // Fetch PL for all locations × all 6 months in parallel
  const allPLResults = await Promise.all(
    locationList.flatMap((loc) =>
      months.map((month) =>
        fetchPLSummary(supabase, loc.id, month).then((pl) => ({ locId: loc.id, month, pl }))
      )
    )
  );

  // Build current month metrics
  const current: LocationMetrics[] = locationList.map((loc) => {
    const entry = allPLResults.find((r) => r.locId === loc.id && r.month === currentMonth);
    const pl = entry?.pl;
    return {
      id: loc.id,
      name: loc.name,
      code: loc.code ?? "",
      state: loc.state ?? "",
      net_sales: pl?.total_net_sales ?? 0,
      food_cost: pl?.food_cost ?? 0,
      total_labor: pl?.total_labor ?? 0,
      infrastructure: pl?.infrastructure ?? 0,
      net_profit: pl?.net_profit ?? 0,
      food_pct: pl?.food_pct ?? 0,
      labor_pct: pl?.labor_pct ?? 0,
      infra_pct: pl?.infra_pct ?? 0,
      net_profit_pct: pl?.net_profit_pct ?? 0,
      prime_cost_pct: (pl?.food_pct ?? 0) + (pl?.labor_pct ?? 0),
      food_by_category: (pl?.food_by_category as Record<string, number>) ?? {},
    };
  });

  // Build 6-month trend
  const trend: MonthTrend[] = months.map((month) => ({
    month,
    label: monthLabel(month),
    locations: locationList.map((loc) => {
      const entry = allPLResults.find((r) => r.locId === loc.id && r.month === month);
      const pl = entry?.pl;
      return {
        id: loc.id,
        prime_cost_pct: (pl?.food_pct ?? 0) + (pl?.labor_pct ?? 0),
        food_pct: pl?.food_pct ?? 0,
        net_profit_pct: pl?.net_profit_pct ?? 0,
      };
    }),
  }));

  const username = profile?.full_name ?? (user.email?.split("@")[0] ?? "");

  return (
    <div className="min-h-screen" style={{ background: "#060b18" }}>
      <CashCallHeader username={username} role={profile?.role ?? "owner"} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <RollupClient current={current} trend={trend} monthLabel={monthLabel(currentMonth)} />
      </main>
    </div>
  );
}
