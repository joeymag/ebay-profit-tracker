import { normalizeSku } from "@/lib/orders/line-item-sku";
import { isOrderCancelled } from "@/lib/orders/order-status";
import type { StoredLineItem, StoredOrder } from "@/lib/orders/types";
import type {
  InventoryChildMapping,
  InventoryMaster,
  InventoryMasterWithChildren,
} from "@/lib/inventory/master-child-types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { lookupAllStockBySku } from "@/lib/shopify/inventory";

export type {
  InventoryChildMapping,
  InventoryMaster,
  InventoryMasterWithChildren,
} from "@/lib/inventory/master-child-types";
export { childSellableUnits } from "@/lib/inventory/master-child-types";

function requireSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required for master/child inventory.");
  }
}

export async function listInventoryMasters(): Promise<InventoryMasterWithChildren[]> {
  requireSupabase();
  const supabase = createSupabaseAdmin();

  const [{ data: masters, error: mastersError }, { data: children, error: childrenError }] =
    await Promise.all([
      supabase.from("inventory_masters").select("*").order("sku"),
      supabase.from("inventory_child_mappings").select("*").order("child_sku"),
    ]);

  if (mastersError) {
    throw new Error(mastersError.message);
  }
  if (childrenError) {
    throw new Error(childrenError.message);
  }

  const childrenByMaster = new Map<string, InventoryChildMapping[]>();
  for (const row of children ?? []) {
    const mapping = childRowToMapping(row);
    const list = childrenByMaster.get(mapping.masterSku) ?? [];
    list.push(mapping);
    childrenByMaster.set(mapping.masterSku, list);
  }

  return (masters ?? []).map((row) => ({
    ...masterRowToMaster(row),
    children: childrenByMaster.get(row.sku) ?? [],
  }));
}

export async function listChildMappingsMap(): Promise<
  Map<string, InventoryChildMapping>
> {
  requireSupabase();
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.from("inventory_child_mappings").select("*");

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, InventoryChildMapping>();
  for (const row of data ?? []) {
    const mapping = childRowToMapping(row);
    const key = normalizeSku(mapping.childSku);
    if (key) {
      map.set(key, mapping);
    }
  }
  return map;
}

export async function upsertInventoryMaster(input: {
  sku: string;
  packSize: number;
  label?: string | null;
  piecesOnHand?: number;
}): Promise<InventoryMaster> {
  requireSupabase();
  const sku = input.sku.trim();
  if (!sku) {
    throw new Error("Master SKU is required.");
  }
  if (!Number.isFinite(input.packSize) || input.packSize <= 0) {
    throw new Error("Pack size must be greater than zero.");
  }

  const supabase = createSupabaseAdmin();

  const { data: existing } = await supabase
    .from("inventory_masters")
    .select("pieces_on_hand")
    .eq("sku", sku)
    .maybeSingle();

  const { data, error } = await supabase
    .from("inventory_masters")
    .upsert(
      {
        sku,
        pack_size: Math.floor(input.packSize),
        label: input.label?.trim() || null,
        pieces_on_hand:
          input.piecesOnHand ??
          (existing ? Number(existing.pieces_on_hand) : 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sku" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return masterRowToMaster(data);
}

export async function syncMasterPiecesFromShopify(
  masterSku: string,
): Promise<InventoryMaster> {
  requireSupabase();
  const sku = masterSku.trim();
  const supabase = createSupabaseAdmin();

  const { data: master, error: masterError } = await supabase
    .from("inventory_masters")
    .select("*")
    .eq("sku", sku)
    .maybeSingle();

  if (masterError) {
    throw new Error(masterError.message);
  }
  if (!master) {
    throw new Error(`Master SKU "${sku}" is not configured.`);
  }

  const shopifyMatches = await lookupAllStockBySku(sku);
  if (shopifyMatches.length === 0) {
    throw new Error(`SKU "${sku}" not found in Shopify.`);
  }

  const shopifyUnits = shopifyMatches.reduce((max, match) => {
    const available = match.locations.reduce((sum, level) => sum + level.available, 0);
    return Math.max(max, available);
  }, 0);
  const piecesOnHand = shopifyUnits * master.pack_size;

  const { data, error } = await supabase
    .from("inventory_masters")
    .update({
      pieces_on_hand: piecesOnHand,
      updated_at: new Date().toISOString(),
    })
    .eq("sku", sku)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return masterRowToMaster(data);
}

export async function upsertChildMapping(input: {
  childSku: string;
  masterSku: string;
  piecesPerUnit: number;
  label?: string | null;
}): Promise<InventoryChildMapping> {
  requireSupabase();
  const childSku = input.childSku.trim();
  const masterSku = input.masterSku.trim();

  if (!childSku) {
    throw new Error("Child SKU is required.");
  }
  if (!masterSku) {
    throw new Error("Master SKU is required.");
  }
  if (!Number.isFinite(input.piecesPerUnit) || input.piecesPerUnit <= 0) {
    throw new Error("Pieces per unit must be greater than zero.");
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("inventory_child_mappings")
    .upsert(
      {
        child_sku: childSku,
        master_sku: masterSku,
        pieces_per_unit: input.piecesPerUnit,
        label: input.label?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "child_sku" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return childRowToMapping(data);
}

export async function deleteChildMapping(childSku: string): Promise<void> {
  requireSupabase();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("inventory_child_mappings")
    .delete()
    .eq("child_sku", childSku.trim());

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteInventoryMaster(sku: string): Promise<void> {
  requireSupabase();
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("inventory_masters")
    .delete()
    .eq("sku", sku.trim());

  if (error) {
    throw new Error(error.message);
  }
}

export function lineItemSkuForInventory(
  item: Pick<StoredLineItem, "sku" | "temuSku">,
): string | null {
  const sku = item.sku?.trim();
  if (sku) {
    return sku;
  }
  return item.temuSku?.trim() || null;
}

/** Apply or refund master piece consumption for synced orders. */
export async function reconcileInventoryConsumption(
  orders: StoredOrder[],
): Promise<{ mastersUpdated: number; lineItemsProcessed: number }> {
  if (!isSupabaseConfigured() || !orders.length) {
    return { mastersUpdated: 0, lineItemsProcessed: 0 };
  }

  const supabase = createSupabaseAdmin();
  const mappings = await listChildMappingsMap();
  if (!mappings.size) {
    return { mastersUpdated: 0, lineItemsProcessed: 0 };
  }

  const orderIds = orders.map((order) => order.shopifyId);
  const activeLineItemIds = new Set<number>();
  const mastersTouched = new Set<string>();
  let lineItemsProcessed = 0;

  for (const order of orders) {
    if (isOrderCancelled(order)) {
      await refundConsumptionForOrder(order.shopifyId, mastersTouched);
      continue;
    }

    for (const item of order.lineItems) {
      activeLineItemIds.add(item.id);
      const skuKey = normalizeSku(lineItemSkuForInventory(item));
      if (!skuKey) {
        continue;
      }

      const mapping = mappings.get(skuKey);
      if (!mapping) {
        continue;
      }

      const expectedPieces = item.quantity * mapping.piecesPerUnit;
      const { data: existing, error: existingError } = await supabase
        .from("inventory_consumption")
        .select("*")
        .eq("shopify_line_item_id", item.id)
        .maybeSingle();

      if (existingError) {
        throw new Error(existingError.message);
      }

      const previousPieces = existing
        ? Number(existing.pieces_consumed)
        : 0;
      const delta = expectedPieces - previousPieces;

      if (delta === 0) {
        continue;
      }

      await adjustMasterPieces(mapping.masterSku, -delta);
      mastersTouched.add(mapping.masterSku);

      const { error: upsertError } = await supabase
        .from("inventory_consumption")
        .upsert(
          {
            shopify_line_item_id: item.id,
            shopify_order_id: order.shopifyId,
            master_sku: mapping.masterSku,
            pieces_consumed: expectedPieces,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "shopify_line_item_id" },
        );

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      lineItemsProcessed += 1;
    }
  }

  const { data: staleRows, error: staleError } = await supabase
    .from("inventory_consumption")
    .select("*")
    .in("shopify_order_id", orderIds);

  if (staleError) {
    throw new Error(staleError.message);
  }

  for (const row of staleRows ?? []) {
    if (activeLineItemIds.has(row.shopify_line_item_id)) {
      continue;
    }

    await adjustMasterPieces(row.master_sku, Number(row.pieces_consumed));
    mastersTouched.add(row.master_sku);

    const { error: deleteError } = await supabase
      .from("inventory_consumption")
      .delete()
      .eq("shopify_line_item_id", row.shopify_line_item_id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  return {
    mastersUpdated: mastersTouched.size,
    lineItemsProcessed,
  };
}

async function refundConsumptionForOrder(
  shopifyOrderId: number,
  mastersTouched: Set<string>,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("inventory_consumption")
    .select("*")
    .eq("shopify_order_id", shopifyOrderId);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of rows ?? []) {
    await adjustMasterPieces(row.master_sku, Number(row.pieces_consumed));
    mastersTouched.add(row.master_sku);
  }

  const { error: deleteError } = await supabase
    .from("inventory_consumption")
    .delete()
    .eq("shopify_order_id", shopifyOrderId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

async function adjustMasterPieces(
  masterSku: string,
  delta: number,
): Promise<void> {
  if (delta === 0) {
    return;
  }

  const supabase = createSupabaseAdmin();
  const { data: master, error: readError } = await supabase
    .from("inventory_masters")
    .select("pieces_on_hand")
    .eq("sku", masterSku)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }
  if (!master) {
    throw new Error(`Master SKU "${masterSku}" is not configured.`);
  }

  const next = Math.max(0, Number(master.pieces_on_hand) + delta);
  const { error: updateError } = await supabase
    .from("inventory_masters")
    .update({
      pieces_on_hand: next,
      updated_at: new Date().toISOString(),
    })
    .eq("sku", masterSku);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function masterRowToMaster(row: {
  sku: string;
  pack_size: number;
  pieces_on_hand: number | string;
  label: string | null;
  updated_at: string;
}): InventoryMaster {
  return {
    sku: row.sku,
    packSize: row.pack_size,
    piecesOnHand: Number(row.pieces_on_hand),
    label: row.label,
    updatedAt: row.updated_at,
  };
}

function childRowToMapping(row: {
  child_sku: string;
  master_sku: string;
  pieces_per_unit: number | string;
  label: string | null;
  updated_at: string;
}): InventoryChildMapping {
  return {
    childSku: row.child_sku,
    masterSku: row.master_sku,
    piecesPerUnit: Number(row.pieces_per_unit),
    label: row.label,
    updatedAt: row.updated_at,
  };
}

export async function getMasterPiecesBySku(): Promise<Map<string, InventoryMaster>> {
  const masters = await listInventoryMasters();
  return new Map(masters.map((master) => [normalizeSku(master.sku) ?? master.sku, master]));
}

export async function getChildMappingBySku(
  sku: string | null | undefined,
): Promise<(InventoryChildMapping & { master: InventoryMaster }) | null> {
  if (!sku?.trim()) {
    return null;
  }

  const mappings = await listChildMappingsMap();
  const mapping = mappings.get(normalizeSku(sku) ?? "");
  if (!mapping) {
    return null;
  }

  const masters = await getMasterPiecesBySku();
  const master = masters.get(normalizeSku(mapping.masterSku) ?? "");
  if (!master) {
    return null;
  }

  return { ...mapping, master };
}
