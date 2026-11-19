import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM = `You are the CashCall AI CFO — a warm, sharp financial advisor built into the CashCall restaurant management platform. You have access to the restaurant owner's real financial data (injected below) and can answer specific questions about their actual numbers.

TONE:
- Warm, direct, human — never corporate
- Use the owner's actual numbers when available — never guess or make up figures
- Keep answers concise (3-6 sentences) unless a detailed breakdown is asked for
- If data is missing or incomplete, say so honestly — never invent numbers
- Give one clear action recommendation when relevant
- Refer to their restaurant by name if you know it

PLATFORM CONTEXT:
- Prime cost = (Food Cost + Labor Cost) ÷ Revenue. Target: under 58%. Above 65% = critical.
- SPMH (Sales Per Man Hour) target: $285/hr
- Food cost target: 28% of sales. Labor target: 30%. Infrastructure target: 19%.
- Pricing: $79/location/month. Enterprise (10+ locations): from $49/location.
- Integrations: Clover, Toast, Square (POS), Gusto, ADP, Intuit (payroll)
- Support: hello@cashcall.io`;

/** Format a dollar amount */
const fmt = (n: number) =>
  "$" + Math.round(n).toLocaleString("en-US");

/** Format a percentage */
const pct = (n: number) =>
  n.toFixed(1) + "%";

/** Health label for prime cost */
function primeLabel(pc: number): string {
  if (pc > 65) return "⚠️ CRITICAL";
  if (pc > 58) return "⚠ WARNING";
  return "✅ HEALTHY";
}

/** Build a rich text context block from the user's real Supabase data */
async function buildUserContext(userId: string): Promise<string> {
  // We create a fresh server client with service-role equivalent access
  // but restricted to the user's own data via RLS (user is authenticated)
  const supabase = await createClient();

  // 1. Fetch locations
  const { data: locations } = await supabase
    .from("locations")
    .select("id,name,code,state")
    .eq("user_id", userId)
    .eq("app", "cashcall")
    .order("name");

  if (!locations || locations.length === 0) {
    return "USER DATA: No restaurant locations found yet. The owner may be setting up their account.";
  }

  const now = new Date();
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const twoMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgoStr = `${twoMonthsAgoDate.getFullYear()}-${String(twoMonthsAgoDate.getMonth() + 1).padStart(2, "0")}-01`;

  const thisMonthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const lastMonthLabel = lastMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const lines: string[] = [
    `=== RESTAURANT OWNER'S LIVE DATA ===`,
    `Owner has ${locations.length} location(s): ${locations.map(l => l.name).join(", ")}`,
    `Current month: ${thisMonthLabel}`,
    "",
  ];

  for (const loc of locations) {
    lines.push(`--- ${loc.name.toUpperCase()} (${loc.state}) ---`);

    // Fetch this month's data in parallel
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthStr = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}-01`;

    const [salesRes, foodRes, laborRes, infraRes, priceSpikesRes] = await Promise.all([
      // Sales this month
      supabase.from("daily_sales")
        .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .eq("location_id", loc.id)
        .gte("sale_date", thisMonthStr)
        .lt("sale_date", nextMonthStr),

      // Food this month
      supabase.from("food_deliveries")
        .select("amount,category")
        .eq("location_id", loc.id)
        .gte("delivery_date", thisMonthStr)
        .lt("delivery_date", nextMonthStr),

      // Labor this month (payroll disbursements + taxes)
      Promise.all([
        supabase.from("salary_disbursements")
          .select("amount")
          .eq("location_id", loc.id)
          .gte("disbursed_on", thisMonthStr)
          .lt("disbursed_on", nextMonthStr),
        supabase.from("monthly_payroll_taxes")
          .select("payroll_tax_amount,workers_comp_amount,benefits_amount")
          .eq("location_id", loc.id)
          .eq("month", thisMonthStr)
          .maybeSingle(),
        supabase.from("foh_salaried_staff")
          .select("monthly_salary")
          .eq("location_id", loc.id)
          .eq("active", true),
      ]),

      // Infrastructure this month
      supabase.from("monthly_infrastructure")
        .select("rent,utilities,insurance,repairs_maintenance,marketing_fee,bank_charges,pos_charges,credit_card_fee")
        .eq("location_id", loc.id)
        .eq("month", thisMonthStr)
        .maybeSingle(),

      // Recent price spikes (last 60 days from price_rollup or invoice line items)
      supabase.from("invoice_line_items")
        .select("description,unit_price,category,invoice_id")
        .eq("location_id", loc.id)
        .gte("created_at", new Date(Date.now() - 60 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    // Parse sales
    const n = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
    const sales = salesRes.data ?? [];
    const totalNet = sales.reduce((s, r) => {
      const gross = n(r.cash_sales) + n(r.pos_sales) + n(r.uber_eats_gross) +
        n(r.grubhub_gross) + n(r.doordash_gross) + n(r.catering_sales) + n(r.cash_tips);
      return s + gross - n(r.aggregator_commission);
    }, 0);

    // Parse food
    const food = foodRes.data ?? [];
    const totalFood = food.reduce((s, r) => s + n(r.amount), 0);
    const foodByCategory: Record<string, number> = {};
    for (const row of food) {
      const cat = String(row.category || "miscellaneous");
      foodByCategory[cat] = (foodByCategory[cat] || 0) + n(row.amount);
    }
    const topFoodCats = Object.entries(foodByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, amt]) => `${cat}: ${fmt(amt)} (${totalFood > 0 ? pct((amt / totalFood) * 100) : "0%"} of food spend)`)
      .join(", ");

    // Parse labor
    const [disbRes, taxRes, salaryRes] = laborRes;
    const disbursed = (disbRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);
    const taxes = n(taxRes.data?.payroll_tax_amount) + n(taxRes.data?.workers_comp_amount) + n(taxRes.data?.benefits_amount);
    const salariedStaff = (salaryRes.data ?? []).reduce((s, r) => s + n(r.monthly_salary), 0);
    const totalLabor = disbursed > 0 ? disbursed + taxes : salariedStaff + taxes;

    // Parse infra
    const inf = infraRes.data ?? {};
    const infFields = ["rent","utilities","insurance","repairs_maintenance","marketing_fee","bank_charges","pos_charges","credit_card_fee"];
    const totalInfra = infFields.reduce((s, f) => s + n((inf as Record<string, unknown>)[f]), 0);

    // KPIs
    const primeCost = totalFood + totalLabor;
    const primePct = totalNet > 0 ? (primeCost / totalNet) * 100 : 0;
    const foodPct = totalNet > 0 ? (totalFood / totalNet) * 100 : 0;
    const laborPct = totalNet > 0 ? (totalLabor / totalNet) * 100 : 0;
    const netProfit = totalNet - totalFood - totalLabor - totalInfra;
    const netProfitPct = totalNet > 0 ? (netProfit / totalNet) * 100 : 0;

    const hasData = totalNet > 0 || totalFood > 0;

    if (!hasData) {
      lines.push(`No data entered yet for ${thisMonthLabel} — location may be getting set up.`);
    } else {
      lines.push(`THIS MONTH (${thisMonthLabel}):`);
      lines.push(`  Sales: ${fmt(totalNet)}`);
      lines.push(`  Food cost: ${fmt(totalFood)} (${pct(foodPct)} of sales, target 28%)`);
      lines.push(`  Labor cost: ${fmt(totalLabor)} (${pct(laborPct)} of sales, target 30%)`);
      lines.push(`  Prime cost: ${fmt(primeCost)} = ${pct(primePct)} ${primeLabel(primePct)}`);
      lines.push(`  Infrastructure: ${fmt(totalInfra)}`);
      lines.push(`  Net profit: ${fmt(netProfit)} (${pct(netProfitPct)} margin)`);
      if (topFoodCats) lines.push(`  Top food spend categories: ${topFoodCats}`);
    }

    // Fetch last month for comparison
    const [lastSalesRes, lastFoodRes, lastLaborDisbRes, lastSalaryRes] = await Promise.all([
      supabase.from("daily_sales")
        .select("cash_sales,pos_sales,uber_eats_gross,grubhub_gross,doordash_gross,catering_sales,cash_tips,aggregator_commission")
        .eq("location_id", loc.id)
        .gte("sale_date", lastMonthStr)
        .lt("sale_date", thisMonthStr),
      supabase.from("food_deliveries")
        .select("amount")
        .eq("location_id", loc.id)
        .gte("delivery_date", lastMonthStr)
        .lt("delivery_date", thisMonthStr),
      supabase.from("salary_disbursements")
        .select("amount")
        .eq("location_id", loc.id)
        .gte("disbursed_on", lastMonthStr)
        .lt("disbursed_on", thisMonthStr),
      supabase.from("foh_salaried_staff")
        .select("monthly_salary")
        .eq("location_id", loc.id)
        .eq("active", true),
    ]);

    const lastSales = (lastSalesRes.data ?? []).reduce((s, r) => {
      const gross = n(r.cash_sales) + n(r.pos_sales) + n(r.uber_eats_gross) +
        n(r.grubhub_gross) + n(r.doordash_gross) + n(r.catering_sales) + n(r.cash_tips);
      return s + gross - n(r.aggregator_commission);
    }, 0);
    const lastFood = (lastFoodRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);
    const lastDisbursed = (lastLaborDisbRes.data ?? []).reduce((s, r) => s + n(r.amount), 0);
    const lastSalaried = (lastSalaryRes.data ?? []).reduce((s, r) => s + n(r.monthly_salary), 0);
    const lastLabor = lastDisbursed > 0 ? lastDisbursed : lastSalaried;
    const lastPrime = lastFood + lastLabor;
    const lastPrimePct = lastSales > 0 ? (lastPrime / lastSales) * 100 : 0;
    const lastFoodPct = lastSales > 0 ? (lastFood / lastSales) * 100 : 0;

    if (lastSales > 0) {
      const salesChg = totalNet > 0 ? ((totalNet - lastSales) / lastSales * 100) : 0;
      const foodChg = foodPct - lastFoodPct;
      const primeChg = primePct - lastPrimePct;
      lines.push(`LAST MONTH (${lastMonthLabel}): Sales ${fmt(lastSales)}, Food ${pct(lastFoodPct)}, Prime ${pct(lastPrimePct)}`);
      if (totalNet > 0) {
        lines.push(`  vs This Month: Sales ${salesChg > 0 ? "+" : ""}${salesChg.toFixed(1)}%, Food cost ${foodChg > 0 ? "+" : ""}${foodChg.toFixed(1)} pp, Prime cost ${primeChg > 0 ? "+" : ""}${primeChg.toFixed(1)} pp`);
      }
    }

    // Price spikes from recent invoice line items
    const recentItems = priceSpikesRes.data ?? [];
    if (recentItems.length > 0) {
      lines.push(`RECENT INVOICES: ${recentItems.length} line items scanned in the last 60 days.`);
    }

    lines.push("");
  }

  // Fetch 2-month-ago data for trend context if multiple months available
  lines.push(`=== END LIVE DATA ===`);
  lines.push(`Answer questions using these ACTUAL numbers. If a piece of data is zero or missing, say the data hasn't been entered yet for that period — don't guess.`);

  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Try to get authenticated user — chat works for both logged-in and public visitors
    let userContext = "";
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        userContext = await buildUserContext(user.id);
      }
    } catch {
      // Not authenticated or data fetch failed — fall through to generic mode
    }

    const systemPrompt = userContext
      ? `${BASE_SYSTEM}\n\n${userContext}`
      : `${BASE_SYSTEM}\n\nNOTE: This user is not logged in. Answer general questions about CashCall. If they ask about their specific numbers, invite them to log in at /login.`;

    const response = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 600,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ content: text });
  } catch (err) {
    console.error("Chat error:", err);
    return NextResponse.json(
      { content: "I'm having a moment — please try again or email hello@cashcall.io" },
      { status: 200 }
    );
  }
}
