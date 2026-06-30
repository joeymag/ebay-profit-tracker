import fs from "fs/promises";
import path from "path";

import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const DATA_DIR = path.join(process.cwd(), "data");
const DELETED_IDS_FILE = path.join(DATA_DIR, "deleted-order-ids.json");

async function readDeletedIdsFromJson(): Promise<Set<number>> {
  try {
    const raw = await fs.readFile(DELETED_IDS_FILE, "utf-8");
    const ids = JSON.parse(raw) as number[];
    return new Set(ids.filter((id) => Number.isFinite(id)));
  } catch {
    return new Set();
  }
}

async function writeDeletedIdsToJson(ids: Set<number>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    DELETED_IDS_FILE,
    JSON.stringify([...ids].sort((a, b) => a - b), null, 2),
    "utf-8",
  );
}

export async function getDeletedOrderIds(): Promise<Set<number>> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("deleted_orders")
      .select("shopify_id");

    if (error) {
      if (error.code === "42P01") {
        return new Set();
      }
      throw new Error(error.message);
    }

    return new Set((data ?? []).map((row) => row.shopify_id));
  }

  return readDeletedIdsFromJson();
}

export async function markOrderDeleted(shopifyId: number): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase
      .from("deleted_orders")
      .upsert({ shopify_id: shopifyId }, { onConflict: "shopify_id" });

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const ids = await readDeletedIdsFromJson();
  ids.add(shopifyId);
  await writeDeletedIdsToJson(ids);
}

export function excludeDeletedOrders<T extends { shopifyId: number }>(
  orders: T[],
  deletedIds: Set<number>,
): T[] {
  if (!deletedIds.size) {
    return orders;
  }

  return orders.filter((order) => !deletedIds.has(order.shopifyId));
}
