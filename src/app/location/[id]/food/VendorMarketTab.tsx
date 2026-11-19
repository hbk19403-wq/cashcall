"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ─── Vendor definitions ──────────────────────────────────────────── */
const VENDORS = [
  { key: "sysco",    name: "Sysco",                short: "SYS", type: "Broadline",    color: "#e03c2c", bg: "#fef2f2" },
  { key: "usfoods",  name: "US Foods",             short: "USF", type: "Broadline",    color: "#2563eb", bg: "#eff6ff" },
  { key: "rd",       name: "Restaurant Depot",     short: "RD",  type: "Cash & Carry", color: "#16a34a", bg: "#f0fdf4" },
  { key: "gfs",      name: "Gordon Food Service",  short: "GFS", type: "Broadline",    color: "#0284c7", bg: "#f0f9ff" },
  { key: "pfg",      name: "Performance Food Grp", short: "PFG", type: "Broadline",    color: "#7c3aed", bg: "#f5f3ff" },
  { key: "costco",   name: "Costco",               short: "COS", type: "Warehouse",    color: "#e07b39", bg: "#fff7ed" },
  { key: "bjs",      name: "BJ's Wholesale",       short: "BJS", type: "Warehouse",    color: "#9333ea", bg: "#faf5ff" },
] as const;
type VKey = typeof VENDORS[number]["key"];

/* ─── Reference market price database ────────────────────────────── */
// Oct 2026 US wholesale prices. Sources: Chef'Store/US Foods flyer (Oct 19–Nov 1 2026),
// Restaurant Depot flyer (Aug–Oct 2026), Costco Business Center (Oct 2026).
// Sysco/US Foods delivered rates estimated (+10–15% over RD cash-and-carry).
// ⚠️ Restaurant Depot (rd) is used as the benchmark when other supplier data is unavailable.
interface MarketItem {
  id: string; name: string; category: string; unit: string;
  keywords: string[];
  prices: Partial<Record<VKey, number>>;
}
const MARKET_DATA: MarketItem[] = [
  // Proteins
  { id:"chkn-breast", name:"Chicken Breast (boneless)", category:"Protein", unit:"per lb",
    keywords:["chicken breast","boneless chicken","chkn breast","chicken breast boneless"],
    prices:{ sysco:3.20, usfoods:3.30, rd:2.19, gfs:3.15, pfg:3.18, costco:2.99, bjs:2.79 } },
  { id:"chkn-thigh",  name:"Chicken Thighs / Leg Meat", category:"Protein", unit:"per lb",
    keywords:["chicken thigh","thigh","chicken leg","leg meat","dark meat"],
    prices:{ sysco:2.05, usfoods:2.15, rd:1.79, gfs:2.00, pfg:2.02, costco:1.89, bjs:1.95 } },
  { id:"beef-ground", name:"Ground Beef 80/20", category:"Protein", unit:"per lb",
    keywords:["ground beef","hamburger","80/20","beef","ground chuck"],
    prices:{ sysco:4.20, usfoods:3.89, rd:3.25, gfs:4.15, pfg:4.10, costco:4.49, bjs:4.19 } },
  { id:"beef-chuck",  name:"Chuck Roast / Brisket", category:"Protein", unit:"per lb",
    keywords:["brisket","chuck roast","chuck","beef roast","flat brisket"],
    prices:{ sysco:5.60, usfoods:5.75, rd:5.10, gfs:5.55, pfg:5.50, costco:5.29 } },
  { id:"beef-steak",  name:"Sirloin / Strip Steak", category:"Protein", unit:"per lb",
    keywords:["sirloin","strip steak","steak","new york strip","ny strip"],
    prices:{ sysco:9.25, usfoods:9.50, rd:8.75, gfs:9.20, pfg:9.15, costco:8.49 } },
  { id:"pork-shldr",  name:"Pork Shoulder (bone-in)", category:"Protein", unit:"per lb",
    keywords:["pork shoulder","pork butt","boston butt","pork","bone-in shoulder"],
    prices:{ sysco:2.60, usfoods:1.99, rd:2.10, gfs:2.55, pfg:2.50, costco:2.19, bjs:2.25 } },
  { id:"pork-loin",   name:"Pork Loin (boneless)", category:"Protein", unit:"per lb",
    keywords:["pork loin","boneless loin","pork tenderloin","loin"],
    prices:{ sysco:2.20, usfoods:1.60, rd:1.75, gfs:2.15, pfg:2.12, costco:1.89, bjs:1.99 } },
  { id:"pork-belly",  name:"Pork Belly", category:"Protein", unit:"per lb",
    keywords:["pork belly","belly","uncured belly"],
    prices:{ sysco:2.89, usfoods:2.29, rd:2.45, gfs:2.82, pfg:2.80, costco:2.59 } },
  { id:"bacon",       name:"Bacon (10 lb case)", category:"Protein", unit:"per 10 lb case",
    keywords:["bacon","sliced bacon"],
    prices:{ sysco:52, usfoods:54, rd:46, gfs:51, pfg:50, costco:48, bjs:49 } },
  { id:"salmon",      name:"Atlantic Salmon", category:"Protein", unit:"per lb",
    keywords:["salmon","atlantic salmon","salmon fillet","salmon filet"],
    prices:{ sysco:9.50, usfoods:5.85, rd:8.49, gfs:9.25, pfg:9.20, costco:8.99 } },
  { id:"shrimp-med",  name:"Shrimp 16/20 ct (IQF)", category:"Protein", unit:"per lb",
    keywords:["shrimp 16/20","shrimp","frozen shrimp","shrimp 16-20","jumbo shrimp"],
    prices:{ sysco:12.50, usfoods:12.99, rd:11.50, gfs:12.25, pfg:12.20, costco:11.99 } },
  { id:"shrimp-sm",   name:"Shrimp 51/60 ct (IQF)", category:"Protein", unit:"per lb",
    keywords:["shrimp 51/60","shrimp 51-60","small shrimp","salad shrimp"],
    prices:{ sysco:5.25, usfoods:5.50, rd:4.59, gfs:5.15, pfg:5.10, costco:4.99 } },
  { id:"tilapia",     name:"Tilapia (IQF)", category:"Protein", unit:"per lb",
    keywords:["tilapia","fish","white fish"],
    prices:{ sysco:4.65, usfoods:4.75, rd:4.25, gfs:4.55, pfg:4.60, costco:4.39 } },
  { id:"turkey",      name:"Ground Turkey", category:"Protein", unit:"per lb",
    keywords:["ground turkey","turkey"],
    prices:{ sysco:3.55, usfoods:3.65, rd:3.35, gfs:3.50, pfg:3.48, costco:3.29, bjs:3.39 } },
  { id:"sausage",     name:"Italian Sausage (bulk)", category:"Protein", unit:"per lb",
    keywords:["sausage","italian sausage","bulk sausage"],
    prices:{ sysco:3.89, usfoods:4.05, rd:3.55, gfs:3.85, pfg:3.82, costco:3.49 } },
  // Produce
  { id:"romaine",     name:"Romaine Lettuce (24 ct)", category:"Produce", unit:"per case",
    keywords:["romaine","romaine lettuce","lettuce","romaine hearts"],
    prices:{ sysco:46, usfoods:49, rd:38, gfs:44, pfg:43, costco:34 } },
  { id:"tomatoes",    name:"Tomatoes (25 lb box)", category:"Produce", unit:"per 25 lb box",
    keywords:["tomato","tomatoes","roma tomato"],
    prices:{ sysco:36, usfoods:38, rd:26, gfs:33, pfg:34, costco:30 } },
  { id:"potatoes",    name:"Russet Potatoes (50 lb)", category:"Produce", unit:"per 50 lb bag",
    keywords:["potato","potatoes","russet","russet potato","idaho potato"],
    prices:{ sysco:28, usfoods:28, rd:19, gfs:27, pfg:26, costco:18, bjs:20 } },
  { id:"sweet-potato",name:"Sweet Potatoes (40 lb)", category:"Produce", unit:"per 40 lb case",
    keywords:["sweet potato","sweet potatoes","yam","yams"],
    prices:{ sysco:48, usfoods:38.99, rd:42, gfs:46, pfg:45, costco:35 } },
  { id:"onion",       name:"Yellow Onions (50 lb)", category:"Produce", unit:"per 50 lb bag",
    keywords:["onion","onions","yellow onion","yellow onions"],
    prices:{ sysco:35, usfoods:30.49, rd:25, gfs:32, pfg:32, costco:20, bjs:22 } },
  { id:"garlic",      name:"Garlic (loose)", category:"Produce", unit:"per lb",
    keywords:["garlic","fresh garlic"],
    prices:{ sysco:5.00, usfoods:5.25, rd:3.65, gfs:4.75, pfg:4.80, costco:3.89 } },
  { id:"bellpepper",  name:"Bell Peppers (25 lb case)", category:"Produce", unit:"per 25 lb case",
    keywords:["bell pepper","peppers","bell peppers","green pepper"],
    prices:{ sysco:50, usfoods:53, rd:36, gfs:47, pfg:48, costco:39 } },
  { id:"mushrooms",   name:"White Mushrooms (10 lb)", category:"Produce", unit:"per 10 lb",
    keywords:["mushroom","mushrooms","white mushroom","button mushroom"],
    prices:{ sysco:24, usfoods:26, rd:20, gfs:23, pfg:24, costco:19 } },
  { id:"spinach",     name:"Baby Spinach (4 lb bag)", category:"Produce", unit:"per 4 lb bag",
    keywords:["spinach","baby spinach"],
    prices:{ sysco:11, usfoods:12, rd:9, gfs:10.50, pfg:10.75, costco:8.25 } },
  { id:"brussels",    name:"Brussels Sprouts (5 lb)", category:"Produce", unit:"per 5 lb bag",
    keywords:["brussels sprouts","brussel sprouts","brussels","sprouts"],
    prices:{ sysco:13, usfoods:9.99, rd:11, gfs:12, pfg:12, costco:9 } },
  { id:"avocado",     name:"Avocados (48 ct case)", category:"Produce", unit:"per 48 ct case",
    keywords:["avocado","avocados","hass avocado"],
    prices:{ sysco:68, usfoods:72, rd:57, gfs:66, pfg:67, costco:53 } },
  // Dairy
  { id:"butter",      name:"Butter Unsalted", category:"Dairy", unit:"per lb",
    keywords:["butter","unsalted butter"],
    prices:{ sysco:4.35, usfoods:4.45, rd:4.05, gfs:4.28, pfg:4.30, costco:3.99, bjs:4.05 } },
  { id:"heavy-cream", name:"Heavy Cream (½ gal)", category:"Dairy", unit:"per ½ gal",
    keywords:["heavy cream","whipping cream","heavy whipping cream"],
    prices:{ sysco:6.25, usfoods:6.45, rd:5.45, gfs:5.99, pfg:6.05, costco:5.25, bjs:5.35 } },
  { id:"milk",        name:"Whole Milk", category:"Dairy", unit:"per gallon",
    keywords:["milk","whole milk"],
    prices:{ sysco:4.85, usfoods:4.95, rd:4.35, gfs:4.65, pfg:4.70, costco:3.99, bjs:4.15 } },
  { id:"cheddar",     name:"Shredded Cheddar (5 lb)", category:"Dairy", unit:"per 5 lb bag",
    keywords:["cheddar","shredded cheddar","cheddar cheese"],
    prices:{ sysco:21, usfoods:21.50, rd:18.50, gfs:20.50, pfg:20.75, costco:18.49, bjs:18.75 } },
  { id:"mozz",        name:"Shredded Mozzarella (5 lb)", category:"Dairy", unit:"per 5 lb bag",
    keywords:["mozzarella","mozz","mozzarella cheese","shredded mozz"],
    prices:{ sysco:19.75, usfoods:20.25, rd:17.25, gfs:19.25, pfg:19.50, costco:16.99, bjs:17.50 } },
  { id:"eggs",        name:"Large Eggs (1 dozen)", category:"Dairy", unit:"per dozen",
    keywords:["eggs","egg","large eggs","dozen eggs"],
    prices:{ sysco:5.25, usfoods:5.45, rd:4.75, gfs:5.10, pfg:5.15, costco:3.99, bjs:4.15 } },
  { id:"sour-cream",  name:"Sour Cream (5 lb tub)", category:"Dairy", unit:"per 5 lb tub",
    keywords:["sour cream"],
    prices:{ sysco:9.25, usfoods:9.50, rd:8.25, gfs:9.00, pfg:9.05, costco:7.49 } },
  { id:"cream-cheese", name:"Cream Cheese (3 lb)", category:"Dairy", unit:"per 3 lb block",
    keywords:["cream cheese"],
    prices:{ sysco:10.25, usfoods:10.50, rd:8.99, gfs:10.00, pfg:10.05, costco:8.49, bjs:8.75 } },
  // Dry Goods
  { id:"flour",       name:"All-Purpose Flour (50 lb)", category:"Dry Goods", unit:"per 50 lb bag",
    keywords:["flour","all purpose flour","ap flour","all-purpose flour"],
    prices:{ sysco:28, usfoods:30, rd:23, gfs:26, pfg:27, costco:18.50, bjs:20.50 } },
  { id:"oil-veg",     name:"Vegetable Oil (35 lb jug)", category:"Dry Goods", unit:"per 35 lb jug",
    keywords:["vegetable oil","cooking oil","fryer oil","canola oil"],
    prices:{ sysco:56, usfoods:58, rd:49, gfs:54, pfg:55, costco:47, bjs:49 } },
  { id:"olive-oil",   name:"Olive Oil EVOO (4 L)", category:"Dry Goods", unit:"per 4L tin",
    keywords:["olive oil","evoo","extra virgin","evoo olive"],
    prices:{ sysco:31, usfoods:33, rd:26, gfs:30, pfg:30, costco:25, bjs:26 } },
  { id:"rice",        name:"Long Grain Rice (25 lb)", category:"Dry Goods", unit:"per 25 lb",
    keywords:["rice","long grain rice","white rice"],
    prices:{ sysco:19.50, usfoods:21.50, rd:15.25, gfs:18.25, pfg:18.50, costco:14.25, bjs:15.25 } },
  { id:"sugar",       name:"Granulated Sugar (25 lb)", category:"Dry Goods", unit:"per 25 lb",
    keywords:["sugar","granulated sugar","cane sugar"],
    prices:{ sysco:21.50, usfoods:23.75, rd:16.25, gfs:19.50, pfg:19.25, costco:15, bjs:16 } },
  { id:"pasta",       name:"Pasta / Spaghetti (20 lb)", category:"Dry Goods", unit:"per 20 lb case",
    keywords:["pasta","spaghetti","noodles","fettuccine","penne","linguine"],
    prices:{ sysco:23.75, usfoods:25.75, rd:17.25, gfs:22.50, pfg:22.25, costco:17.25, bjs:18.25 } },
  { id:"canned-tom",  name:"Canned Tomatoes (6 × #10)", category:"Dry Goods", unit:"per 6-can case",
    keywords:["canned tomato","crushed tomato","whole peeled","tomato sauce","tomato paste","canned"],
    prices:{ sysco:31, usfoods:33, rd:22, gfs:28.50, pfg:28.25, costco:24.25 } },
  { id:"broth",       name:"Chicken Broth (12 qt case)", category:"Dry Goods", unit:"per 12-qt case",
    keywords:["chicken broth","chicken stock","broth","stock","base"],
    prices:{ sysco:26, usfoods:28, rd:19.75, gfs:24, pfg:23.75, costco:19.75, bjs:20.50 } },
  { id:"salt",        name:"Salt (25 lb)", category:"Dry Goods", unit:"per 25 lb bag",
    keywords:["salt","table salt","kosher salt","sea salt"],
    prices:{ sysco:8.75, usfoods:9.75, rd:6.50, gfs:8.50, pfg:7.75, costco:5.50, bjs:6.50 } },
  { id:"pepper",      name:"Black Pepper (5 lb)", category:"Dry Goods", unit:"per 5 lb bag",
    keywords:["black pepper","pepper","ground pepper"],
    prices:{ sysco:19.50, usfoods:21.75, rd:15.25, gfs:18.25, pfg:18.50, costco:13.25, bjs:15.25 } },
  { id:"panko",       name:"Panko Breadcrumbs (25 lb)", category:"Dry Goods", unit:"per 25 lb bag",
    keywords:["panko","breadcrumbs","bread crumbs","panko bread"],
    prices:{ sysco:41, usfoods:43.50, rd:32.50, gfs:39, pfg:38.75, costco:30.50 } },
];

/* ─── Helpers ─────────────────────────────────────────────────────── */
function matchItem(name: string): MarketItem | null {
  const norm = name.toLowerCase().trim();
  let best: MarketItem | null = null, bestScore = 0;
  for (const item of MARKET_DATA) {
    for (const kw of item.keywords) {
      if (norm.includes(kw) || kw.includes(norm)) {
        const score = kw.length;
        if (score > bestScore) { bestScore = score; best = item; }
      }
    }
  }
  return bestScore > 2 ? best : null;
}

function cheapestVendor(item: MarketItem): { key: VKey; price: number } | null {
  let bestKey: VKey | null = null, bestVal = Infinity;
  for (const [k, v] of Object.entries(item.prices)) {
    if (v != null && v < bestVal) { bestVal = v; bestKey = k as VKey; }
  }
  return bestKey ? { key: bestKey, price: bestVal } : null;
}

function heatColor(val: number, min: number, max: number) {
  if (min === max) return "#f1f5f9";
  const r = (val - min) / (max - min);
  if (r < 0.2) return "#dcfce7";
  if (r < 0.4) return "#d1fae5";
  if (r < 0.6) return "#fef9c3";
  if (r < 0.8) return "#fed7aa";
  return "#fecaca";
}

const fmtUSD = (n: number) => `$${n.toFixed(2)}`;
const fmtUSD0 = (n: number) => `$${n.toFixed(0)}`;

interface UserItem {
  name: string;
  category: string;
  avgUnitPrice: number;      // avg unit_price from invoices
  totalQty: number;          // total qty ordered across period
  totalSpend: number;        // total spend ($) in period
  monthlySpend: number;      // projected monthly spend
  vendors: string[];         // distinct vendors used
  invoiceCount: number;
  matched: MarketItem | null;
}

/* ─── Component ───────────────────────────────────────────────────── */
export default function VendorMarketTab({ locationId }: { locationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [tab, setTab] = useState<"shopping" | "market" | "savings">("shopping");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  // Default to the 4 primary suppliers the user cares about (user can toggle others)
  const [selectedVendors, setSelectedVendors] = useState<Set<VKey>>(
    new Set(["sysco", "usfoods", "rd", "costco"] as VKey[])
  );

  /* ── Load user's historical invoice data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setMonth(since.getMonth() - months);

      const { data: deliveries } = await supabase
        .from("food_deliveries")
        .select("id,vendor,delivery_date")
        .eq("location_id", locationId)
        .gte("delivery_date", since.toISOString().slice(0, 10));

      if (!deliveries?.length) { setLoading(false); return; }

      const dMap: Record<string, { vendor: string; date: string }> = {};
      for (const d of deliveries) dMap[d.id] = { vendor: d.vendor, date: d.delivery_date };

      const { data: lineItems } = await supabase
        .from("invoice_line_items")
        .select("name,qty,unit,unit_price,total,category,food_delivery_id")
        .in("food_delivery_id", deliveries.map(d => d.id))
        .not("unit_price", "is", null)
        .gt("unit_price", 0);

      if (!lineItems?.length) { setLoading(false); return; }

      // Aggregate by normalized item name
      const agg: Record<string, {
        name: string; category: string;
        prices: number[]; qtys: number[]; totals: number[];
        vendors: Set<string>; count: number;
      }> = {};

      for (const li of lineItems) {
        const key = li.name.toLowerCase().trim();
        if (!agg[key]) agg[key] = {
          name: li.name, category: li.category ?? "",
          prices: [], qtys: [], totals: [],
          vendors: new Set(), count: 0,
        };
        const g = agg[key];
        if (li.unit_price) g.prices.push(Number(li.unit_price));
        if (li.qty) g.qtys.push(Number(li.qty));
        if (li.total) g.totals.push(Number(li.total));
        const d = dMap[li.food_delivery_id];
        if (d?.vendor) g.vendors.add(d.vendor);
        g.count++;
      }

      const periodMonths = months;
      const items: UserItem[] = Object.values(agg)
        .filter(g => g.prices.length > 0)
        .map(g => {
          const avgUnitPrice = g.prices.reduce((s, v) => s + v, 0) / g.prices.length;
          const totalQty = g.qtys.reduce((s, v) => s + v, 0);
          const totalSpend = g.totals.reduce((s, v) => s + v, 0) ||
            (avgUnitPrice * totalQty);
          const monthlySpend = totalSpend / periodMonths;
          return {
            name: g.name,
            category: g.category,
            avgUnitPrice,
            totalQty,
            totalSpend,
            monthlySpend,
            vendors: Array.from(g.vendors),
            invoiceCount: g.count,
            matched: matchItem(g.name),
          };
        })
        .sort((a, b) => b.monthlySpend - a.monthlySpend);

      setUserItems(items);
      setLoading(false);
    })();
  }, [locationId, months, supabase]);

  const matchedItems = userItems.filter(it => it.matched !== null);
  const totalMonthlySpend = userItems.reduce((s, it) => s + it.monthlySpend, 0);
  const optimizedMonthly = matchedItems.reduce((s, it) => {
    const best = cheapestVendor(it.matched!);
    if (!best) return s + it.monthlySpend;
    // We can only compare per-unit, not per-case vs per-lb directly for all
    // So we compute savings as (avgUnitPrice - best.price) × monthly_qty estimate
    const monthlyQty = it.totalQty / months;
    const optimized = best.price * monthlyQty;
    const current = it.avgUnitPrice * monthlyQty;
    return s + Math.min(current, optimized); // use whichever is cheaper
  }, 0);
  const totalPotentialSaving = matchedItems.reduce((s, it) => {
    const best = cheapestVendor(it.matched!);
    if (!best) return s;
    const monthlyQty = it.totalQty / months;
    const diff = (it.avgUnitPrice - best.price) * monthlyQty;
    return s + (diff > 0 ? diff : 0);
  }, 0);

  const allCats = ["All", ...Array.from(new Set(MARKET_DATA.map(m => m.category)))];

  const filteredMarket = MARKET_DATA.filter(item => {
    if (catFilter !== "All" && item.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.keywords.some(k => k.includes(q));
    }
    return true;
  });

  const activeVendors = VENDORS.filter(v => selectedVendors.has(v.key));

  const savingsItems = matchedItems
    .map(it => {
      const best = cheapestVendor(it.matched!);
      if (!best) return null;
      const diff = it.avgUnitPrice - best.price;
      if (diff <= 0.05) return null;
      const monthlyQty = it.totalQty / months;
      return { ...it, bestVKey: best.key, bestPrice: best.price, unitSaving: diff, monthlySaving: diff * monthlyQty };
    })
    .filter(Boolean)
    .sort((a, b) => b!.monthlySaving - a!.monthlySaving) as NonNullable<typeof savingsItems[number]>[];

  const getV = (key: VKey) => VENDORS.find(v => v.key === key)!;

  /* ── Vendor scorecard: how many items cheapest + total monthly savings by switching to that vendor ── */
  const vendorScores = VENDORS.map(v => {
    const cheapestCount = MARKET_DATA.filter(m => cheapestVendor(m)?.key === v.key).length;
    const mySavings = savingsItems.filter(it => it.bestVKey === v.key).reduce((s, it) => s + it.monthlySaving, 0);
    return { ...v, cheapestCount, mySavings };
  }).sort((a, b) => b.mySavings - a.mySavings);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">Analyzing {months}-month purchase history…</p>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Top bar ── */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold">🏪 Vendor Market Intelligence</h2>
            <p className="text-slate-300 text-xs mt-0.5">
              Your actual purchase history × 7 major US distributors — where to save real money
            </p>
          </div>
          <select value={months} onChange={e => setMonths(Number(e.target.value))}
            className="bg-slate-700 text-white text-xs rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none">
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </select>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400">Tracked items</p>
            <p className="text-xl font-bold">{userItems.length}</p>
            <p className="text-[10px] text-slate-500">{matchedItems.length} matched to market</p>
          </div>
          <div className="bg-slate-700/50 rounded-xl p-3">
            <p className="text-xs text-slate-400">Avg monthly spend</p>
            <p className="text-xl font-bold">{fmtUSD0(totalMonthlySpend)}</p>
            <p className="text-[10px] text-slate-500">from invoice line items</p>
          </div>
          <div className="bg-emerald-700/60 rounded-xl p-3">
            <p className="text-xs text-emerald-300">Potential saving/mo</p>
            <p className="text-xl font-bold text-emerald-300">{fmtUSD0(totalPotentialSaving)}</p>
            <p className="text-[10px] text-emerald-400">by switching to best vendors</p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { key: "shopping", label: "🛒 My Shopping List" },
            { key: "market",   label: "📊 Market Prices" },
            { key: "savings",  label: `💰 Savings Opportunities${savingsItems.length > 0 ? ` (${savingsItems.length})` : ""}` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? "bg-white text-slate-900" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: My Shopping List ── */}
      {tab === "shopping" && (
        <div className="space-y-4">
          {userItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <p className="text-2xl mb-2">📋</p>
              <p className="font-semibold text-gray-700">No invoice line items yet</p>
              <p className="text-xs text-gray-400 mt-1">Scan invoices with AI OCR to capture item-by-item pricing. The more invoices you scan, the better the market comparison gets.</p>
            </div>
          ) : (
            <>
              {/* Monthly spend chart */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-1">Monthly Spend by Item (top 12)</h3>
                <p className="text-xs text-gray-400 mb-3">Green bar = cheapest market price available; orange bar = what you currently pay</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={userItems.slice(0, 12).map(it => {
                      const best = it.matched ? cheapestVendor(it.matched) : null;
                      const monthlyQty = it.totalQty / months;
                      return {
                        name: it.name.length > 18 ? it.name.slice(0, 16) + "…" : it.name,
                        you: Math.round(it.monthlySpend * 100) / 100,
                        market: best ? Math.round(best.price * monthlyQty * 100) / 100 : null,
                      };
                    })}
                    margin={{ top: 4, right: 10, left: 0, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} width={45} />
                    <Tooltip formatter={(v, name) => [`$${Number(v).toFixed(2)}`, name === "you" ? "You pay" : "Best market"]} />
                    <Bar dataKey="you" name="You pay" fill="#f97316" radius={[3,3,0,0]} />
                    <Bar dataKey="market" name="Best market" fill="#22c55e" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Full item table */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-gray-900">All Items You Buy ({userItems.length})</h3>
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search item…"
                    className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Avg Unit $</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Est. Mo. Spend</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Your Vendors</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-green-700">Best Market</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-green-700">Best Vendor</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-emerald-700">Mo. Saving</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {userItems
                        .filter(it => !search || it.name.toLowerCase().includes(search.toLowerCase()))
                        .map((it, i) => {
                          const best = it.matched ? cheapestVendor(it.matched) : null;
                          const monthlyQty = it.totalQty / months;
                          const saving = best ? (it.avgUnitPrice - best.price) * monthlyQty : 0;
                          const bv = best ? getV(best.key) : null;
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-gray-800">
                                {it.name}
                                <span className="block text-[10px] text-gray-400">{it.invoiceCount} invoice lines · {it.category}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-orange-600">
                                {fmtUSD(it.avgUnitPrice)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {fmtUSD(it.monthlySpend)}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 max-w-[130px]">
                                <span className="truncate block">{it.vendors.slice(0,2).join(", ")}{it.vendors.length > 2 ? ` +${it.vendors.length-2}` : ""}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-green-700">
                                {best ? fmtUSD(best.price) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {bv ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                    style={{ color: bv.color, background: bv.bg }}>{bv.short}</span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {saving > 0.05 ? (
                                  <span className="font-bold text-emerald-600">-{fmtUSD(saving)}</span>
                                ) : best && saving <= 0 ? (
                                  <span className="text-xs text-emerald-500">✓ optimal</span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-2.5 font-bold text-gray-700" colSpan={2}>Monthly Total</td>
                        <td className="px-3 py-2.5 text-right font-bold text-gray-900 tabular-nums">{fmtUSD(totalMonthlySpend)}</td>
                        <td colSpan={3} />
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600 tabular-nums">-{fmtUSD(totalPotentialSaving)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Market Prices ── */}
      {tab === "market" && (
        <div className="space-y-4">
          {/* Vendor toggles */}
          <div className="flex flex-wrap gap-2">
            {VENDORS.map(v => (
              <button key={v.key}
                onClick={() => setSelectedVendors(prev => {
                  const n = new Set(prev);
                  if (n.has(v.key)) { if (n.size > 1) n.delete(v.key); } else n.add(v.key);
                  return n;
                })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  selectedVendors.has(v.key)
                    ? "text-white border-transparent"
                    : "bg-white text-gray-400 border-gray-200"
                }`}
                style={selectedVendors.has(v.key) ? { background: v.color, borderColor: v.color } : {}}>
                {v.name}
                <span className="opacity-70 text-[10px]">{v.type}</span>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap">
              {allCats.map(c => (
                <button key={c} onClick={() => setCatFilter(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${catFilter === c ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
                  {c}
                </button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search commodity…"
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {/* Heat map legend */}
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span>Price heat-map:</span>
            {[["#dcfce7","Lowest"],["#d1fae5","Low"],["#fef9c3","Mid"],["#fed7aa","High"],["#fecaca","Highest"]].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-4 h-3 rounded" style={{ background: c }} /> {l}
              </span>
            ))}
            <span className="ml-1">⭐ = cheapest</span>
            {userItems.length > 0 && <span className="text-indigo-500 ml-2">🔵 = you buy this</span>}
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 min-w-[180px]">Commodity</th>
                    <th className="text-left px-3 py-3 font-semibold text-gray-500 min-w-[90px]">Unit</th>
                    {activeVendors.map(v => (
                      <th key={v.key} className="px-3 py-3 text-right min-w-[72px]">
                        <span className="font-bold" style={{ color: v.color }}>{v.short}</span>
                        <span className="block text-[9px] text-gray-400 font-normal">{v.type}</span>
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 font-semibold text-green-700 min-w-[100px]">Best Price</th>
                    {userItems.length > 0 && (
                      <th className="text-right px-3 py-3 font-semibold text-indigo-700 min-w-[80px]">Your Price</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredMarket.map(item => {
                    const avail = activeVendors.map(v => item.prices[v.key]).filter((p): p is number => p != null);
                    const min = Math.min(...avail), max = Math.max(...avail);
                    const best = cheapestVendor(item);
                    const bv = best ? getV(best.key) : null;

                    // User's price for this item
                    const userMatch = userItems.find(u => u.matched?.id === item.id);

                    return (
                      <tr key={item.id} className={`hover:bg-blue-50/30 transition-colors ${userMatch ? "bg-indigo-50/20" : ""}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {userMatch && <span className="text-indigo-500 mr-1">🔵</span>}
                          {item.name}
                          <span className="block text-[10px] text-gray-400">{item.category}</span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-400">{item.unit}</td>
                        {activeVendors.map(v => {
                          const price = item.prices[v.key];
                          return (
                            <td key={v.key} className="px-3 py-2.5 text-right tabular-nums font-semibold"
                              style={{ background: price != null ? heatColor(price, min, max) : "transparent" }}>
                              {price != null ? (
                                <span style={{ color: price === min ? "#15803d" : "#374151" }}>
                                  {price === min ? "⭐ " : ""}{fmtUSD(price)}
                                </span>
                              ) : <span className="text-gray-200">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center">
                          {bv && best && (
                            <span className="flex flex-col items-center">
                              <span className="font-bold text-green-700">{fmtUSD(best.price)}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold mt-0.5"
                                style={{ color: bv.color, background: bv.bg }}>{bv.short}</span>
                            </span>
                          )}
                        </td>
                        {userItems.length > 0 && (
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {userMatch ? (
                              <span className={`font-semibold ${best && userMatch.avgUnitPrice > best.price ? "text-orange-600" : "text-emerald-600"}`}>
                                {fmtUSD(userMatch.avgUnitPrice)}
                                {best && userMatch.avgUnitPrice > best.price && (
                                  <span className="block text-[10px] text-red-400">
                                    +{fmtUSD(userMatch.avgUnitPrice - best.price)} vs best
                                  </span>
                                )}
                              </span>
                            ) : <span className="text-gray-200">—</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendor scorecards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {VENDORS.map(v => {
              const cheapCount = MARKET_DATA.filter(m => cheapestVendor(m)?.key === v.key).length;
              return (
                <div key={v.key} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.color }} />
                    <span className="font-semibold text-xs text-gray-800">{v.name}</span>
                  </div>
                  <p className="text-[10px] text-gray-500">{v.type}</p>
                  <p className="text-base font-bold mt-1" style={{ color: v.color }}>{cheapCount}</p>
                  <p className="text-[10px] text-gray-400">items cheapest</p>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            ⚠️ Oct 2026 prices sourced from Chef'Store/US Foods flyer, Restaurant Depot, and Costco Business Center. Sysco/US Foods delivered rates estimated. Restaurant Depot used as benchmark when other data unavailable. Confirm with vendors before switching.
          </p>
        </div>
      )}

      {/* ── TAB: Savings Opportunities ── */}
      {tab === "savings" && (
        <div className="space-y-4">
          {userItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <p className="text-2xl mb-2">📊</p>
              <p className="font-semibold text-gray-700">Scan invoices first</p>
              <p className="text-xs text-gray-400 mt-1">Use AI OCR to scan your invoices — we'll pull item-by-item prices and cross-reference against 7 major vendors to find where you're overpaying.</p>
            </div>
          ) : savingsItems.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-bold text-emerald-800">Great pricing! No significant savings found.</p>
              <p className="text-xs text-emerald-600 mt-1">You're already near or at market-best prices on matched items.</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-3xl">💰</span>
                  <div className="flex-1">
                    <p className="font-bold text-emerald-900 text-lg">
                      Save ~{fmtUSD0(totalPotentialSaving)}/month · {fmtUSD0(totalPotentialSaving * 12)}/year
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Based on {savingsItems.length} items where market price is lower than your avg. {months}-month price
                    </p>
                  </div>
                </div>
              </div>

              {/* Best vendors for your shopping list */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900">Which Vendor Saves You the Most</h3>
                  <p className="text-xs text-gray-400">Ranked by total monthly savings across your actual purchase history</p>
                </div>
                <div className="p-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={vendorScores.filter(v => v.mySavings > 0)}
                      margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 10 }} width={45} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}/mo saved`, "Savings"]} />
                      <Bar dataKey="mySavings" radius={[4,4,0,0]}>
                        {vendorScores.filter(v => v.mySavings > 0).map((v) => (
                          <Cell key={v.key} fill={v.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detailed savings table */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-900">Item-by-Item Savings Breakdown</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Your avg unit price vs. best available market price, applied to your monthly purchase volume</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-semibold">Item You Buy</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Your Vendors</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-orange-600">Your Avg $/unit</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-green-700">Best Market</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Save/unit</th>
                        <th className="text-right px-3 py-2.5 font-semibold text-emerald-700">Est. Mo. Saving</th>
                        <th className="text-center px-3 py-2.5 font-semibold text-green-700">Switch To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {savingsItems.map((it, i) => {
                        const bv = getV(it.bestVKey);
                        return (
                          <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-gray-800">{it.name}</span>
                              <span className="block text-[10px] text-gray-400">{it.matched?.name} · {it.matched?.unit}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 max-w-[120px]">
                              <span className="truncate block">{it.vendors.slice(0,2).join(", ")}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-orange-600">
                              {fmtUSD(it.avgUnitPrice)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-green-700">
                              {fmtUSD(it.bestPrice)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              <span className="text-emerald-600 font-semibold">-{fmtUSD(it.unitSaving)}</span>
                              <span className="block text-[10px] text-emerald-500">
                                ({((it.unitSaving / it.avgUnitPrice) * 100).toFixed(0)}% less)
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700">
                              -{fmtUSD(it.monthlySaving)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
                                style={{ color: bv.color, background: bv.bg }}>
                                {bv.name}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                        <td colSpan={5} className="px-4 py-3 font-bold text-gray-700">Total Monthly Savings Potential</td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-700 tabular-nums text-sm">
                          -{fmtUSD0(totalPotentialSaving)}/mo
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Vendor profiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {vendorScores.map(v => (
                  <div key={v.key} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.color }} />
                      <span className="font-semibold text-xs text-gray-800">{v.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-500">{v.type}</p>
                    {v.mySavings > 0 ? (
                      <>
                        <p className="text-base font-bold mt-1 text-emerald-600">-{fmtUSD0(v.mySavings)}/mo</p>
                        <p className="text-[10px] text-gray-400">if you switch your items here</p>
                      </>
                    ) : (
                      <>
                        <p className="text-base font-bold mt-1 text-gray-400">{v.cheapestCount} items</p>
                        <p className="text-[10px] text-gray-400">cheapest in overall market</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="text-[11px] text-gray-400 text-center">
            ⚠️ Savings estimates use your avg unit price vs. Oct 2026 market rates (Chef'Store/US Foods, Restaurant Depot, Costco Business Center). Restaurant Depot used as benchmark when supplier-specific data is unavailable. Confirm with vendors before switching.
          </p>
        </div>
      )}
    </div>
  );
}
