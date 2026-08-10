import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import { resolveLineItemSkuKey } from "@/lib/orders/line-item-sku";
import { getSalesChannel } from "@/lib/orders/channel";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type SkuCostSnapshot = {
  unitCost: number | null;
  defaultPostage: number | null;
};

function normalizeSku(sku: string | null | undefined): string | null {
  const trimmed = sku?.trim();
  return trimmed ? trimmed : null;
}

function snapshotFromRow(row: {
  unit_cost: number | null;
  default_postage?: number | null;
}): SkuCostSnapshot {
  return {
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    defaultPostage:
      row.default_postage != null ? Number(row.default_postage) : null,
  };
}

/** Load unit cost + default postage for listing SKUs from the products catalog. */
export async function getSkuCostSnapshots(
  skus: Array<string | null | undefined>,
): Promise<Map<string, SkuCostSnapshot>> {
  const result = new Map<string, SkuCostSnapshot>();
  const unique = [
    ...new Set(
      skus
        .map((sku) => normalizeSku(sku))
        .filter((sku): sku is string => Boolean(sku)),
    ),
  ];

  for (const sku of unique) {
    result.set(sku, { unitCost: null, defaultPostage: null });
  }

  if (!unique.length || !isSupabaseConfigured()) {
    return result;
  }

  const supabase = createSupabaseAdmin();
  const { data: products, error } = await supabase
    .from("products")
    .select("sku, unit_cost, default_postage")
    .in("sku", unique);

  if (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("products")
      .select("sku, unit_cost")
      .in("sku", unique);

    if (fallbackError) {
      throw new Error(fallbackError.message);
    }

    for (const row of fallback ?? []) {
      result.set(row.sku, snapshotFromRow(row));
    }
  } else {
    for (const row of products ?? []) {
      result.set(row.sku, snapshotFromRow(row));
    }
  }

  const missingPostage = unique.filter(
    (sku) => result.get(sku)?.defaultPostage == null,
  );
  if (!missingPostage.length) {
    return result;
  }

  const { data: lineItems, error: lineError } = await supabase
    .from("order_line_items")
    .select("sku, title, shopify_order_id")
    .in("sku", missingPostage)
    .order("shopify_order_id", { ascending: false })
    .limit(200);

  if (lineError || !lineItems?.length) {
    return result;
  }

  const orderIds = [...new Set(lineItems.map((row) => row.shopify_order_id))];
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("shopify_id, tags, shipping_label_cost, created_at")
    .in("shopify_id", orderIds);

  if (ordersError || !orders?.length) {
    return result;
  }

  const orderById = new Map(
    orders.map((order) => [order.shopify_id, order] as const),
  );

  for (const item of lineItems) {
    const sku = resolveLineItemSkuKey(item.sku, item.title);
    if (!sku || !missingPostage.includes(sku)) {
      continue;
    }

    const current = result.get(sku);
    if (!current || current.defaultPostage != null) {
      continue;
    }

    const order = orderById.get(item.shopify_order_id);
    if (!order || getSalesChannel(order.tags) !== "eBay") {
      continue;
    }
    if (order.shipping_label_cost == null) {
      continue;
    }

    result.set(sku, {
      ...current,
      defaultPostage: Number(order.shipping_label_cost),
    });
  }

  return result;
}

export async function upsertSkuCosts(input: {
  sku: string;
  title?: string | null;
  unitCost?: number | null;
  defaultPostage?: number | null;
}): Promise<SkuCostSnapshot> {
  const sku = normalizeSku(input.sku);
  if (!sku) {
    throw new Error("SKU is required to save costs.");
  }
  if (!isSupabaseConfigured()) {
    throw new Error("Products require Supabase configuration.");
  }

  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("products")
    .select("sku, title")
    .eq("sku", sku)
    .maybeSingle();

  if (!existing) {
    const insertPayload: ProductInsert = {
      sku,
      title: input.title?.trim() || sku,
      updated_at: now,
    };
    if (input.unitCost !== undefined) {
      insertPayload.unit_cost = input.unitCost;
    }
    if (input.defaultPostage !== undefined) {
      insertPayload.default_postage = input.defaultPostage;
    }

    const { data, error } = await supabase
      .from("products")
      .insert(insertPayload)
      .select("sku, unit_cost, default_postage")
      .single();

    if (error) {
      if (
        input.defaultPostage !== undefined &&
        /default_postage/i.test(error.message)
      ) {
        const { default_postage: _ignored, ...withoutPostage } = insertPayload;
        const retry = await supabase
          .from("products")
          .insert(withoutPostage)
          .select("sku, unit_cost")
          .single();
        if (retry.error) {
          throw new Error(retry.error.message);
        }
        return snapshotFromRow(retry.data);
      }
      throw new Error(error.message);
    }

    return snapshotFromRow(data);
  }

  const updatePayload: ProductUpdate = {
    updated_at: now,
  };
  if (input.title?.trim()) {
    updatePayload.title = input.title.trim();
  }
  if (input.unitCost !== undefined) {
    updatePayload.unit_cost = input.unitCost;
  }
  if (input.defaultPostage !== undefined) {
    updatePayload.default_postage = input.defaultPostage;
  }

  const { data, error } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("sku", sku)
    .select("sku, unit_cost, default_postage")
    .single();

  if (error) {
    if (
      input.defaultPostage !== undefined &&
      /default_postage/i.test(error.message)
    ) {
      const { default_postage: _ignored, ...withoutPostage } = updatePayload;
      const retry = await supabase
        .from("products")
        .update(withoutPostage)
        .eq("sku", sku)
        .select("sku, unit_cost")
        .single();
      if (retry.error) {
        throw new Error(retry.error.message);
      }
      return snapshotFromRow(retry.data);
    }
    throw new Error(error.message);
  }

  return snapshotFromRow(data);
}
