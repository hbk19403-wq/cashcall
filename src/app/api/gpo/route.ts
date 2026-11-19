import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Verify auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call the get_gpo_summary Postgres function
  const { data, error } = await supabase.rpc("get_gpo_summary", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[GPO] RPC error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch per-location breakdown for items with savings
  const topItems: string[] = (data || []).slice(0, 20).map((r: { item_name: string }) => r.item_name);

  let breakdown: Record<string, { location_id: string; location_name: string; avg_price: number; qty: number }[]> = {};

  if (topItems.length > 0) {
    const { data: bdData } = await supabase.rpc("get_gpo_item_breakdown", {
      p_user_id: user.id,
      p_items: topItems,
    });
    if (bdData) {
      for (const row of bdData) {
        (breakdown[row.item_name] ??= []).push({
          location_id: row.location_id,
          location_name: row.location_name,
          avg_price: row.avg_price,
          qty: row.qty,
        });
      }
    }
  }

  return NextResponse.json({ items: data || [], breakdown });
}
