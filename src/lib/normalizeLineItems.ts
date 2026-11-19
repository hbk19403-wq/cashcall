/**
 * normalizeLineItems
 * ------------------
 * Before inserting invoice_line_items, call find_or_create_item() in Postgres
 * (via Supabase RPC) for every unique item name. This deduplicates OCR noise
 * ("Chkn Bst 5#" == "Chicken Breast 5lb") and populates the item_id FK,
 * enabling the canonical items_master price tracking layer.
 *
 * Falls back gracefully if the migration hasn't run yet (item_id stays null).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RawLineItem {
  name: string;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total?: number | null;
  category?: string | null;
  /** Exact text from invoice before normalization (architecture Phase 2) */
  raw_description?: string | null;
  /** Per-item OCR confidence: "high" | "medium" | "low" */
  ocr_confidence?: string | null;
  is_catch_weight?: boolean | null;
  is_credit?: boolean | null;
  is_fee?: boolean | null;
}

export interface NormalizedLineItem extends RawLineItem {
  item_id: string | null;
}

/**
 * Resolves each unique item name to a canonical items_master id.
 * Deduplicates the names so each unique name only makes one RPC call.
 * Returns the original array with item_id populated.
 */
export async function normalizeLineItems(
  supabase: SupabaseClient,
  items: RawLineItem[]
): Promise<NormalizedLineItem[]> {
  if (!items.length) return [];

  // Deduplicate names — one RPC call per unique name
  const uniqueNames = Array.from(new Set(items.map(i => i.name?.trim()).filter(Boolean))) as string[];
  const idMap = new Map<string, string | null>();

  await Promise.all(
    uniqueNames.map(async (name) => {
      // Find the first item with this name to get category/unit hints
      const hint = items.find(i => i.name?.trim() === name);
      try {
        const { data, error } = await supabase.rpc("find_or_create_item", {
          p_raw_name: name,
          p_category: hint?.category || "OTHER",
          p_unit:     hint?.unit    || null,
        });
        idMap.set(name, error ? null : (data as string | null));
      } catch {
        // RPC doesn't exist yet (migration not run) — silently skip
        idMap.set(name, null);
      }
    })
  );

  return items.map(item => ({
    ...item,
    item_id: idMap.get(item.name?.trim() ?? "") ?? null,
  }));
}
