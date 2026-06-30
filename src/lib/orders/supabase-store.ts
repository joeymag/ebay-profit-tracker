import {
  applyProductCostsToOrder,
  applyProductCostsToOrders,
} from "@/lib/orders/apply-product-costs";
import { withComputedFinancials } from "@/lib/orders/financials";
import {
  getDeletedOrderIds,
  markOrderDeleted,
} from "@/lib/orders/deleted-orders";
import {
  applySkuCostDefaultsToOrders,
  buildSkuCostDefaultsFromOrders,
  type SkuDefaultSourceOrder,
} from "@/lib/orders/sku-cost-defaults";
import { shippingAddressFingerprint, shippingAddressFromFields, shippingAddressToFields, mergeShippingAddressOnSync } from "@/lib/orders/shipping-address";
import { parseEbayUsernameForOrder } from "@/lib/orders/ebay-buyer";
import { mergeBuyerIdentityOnSync } from "@/lib/shopify/buyer-name";
import type { OrdersDatabase, StoredOrder } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type OrderRow = Database["public"]["Tables"]["orders"]["Insert"];
type LineItemInsert = Database["public"]["Tables"]["order_line_items"]["Insert"];
type LineItemRow = Database["public"]["Tables"]["order_line_items"]["Row"];

const BATCH_SIZE = 100;

function orderToRow(order: StoredOrder, syncedAt: string): OrderRow {
  return {
    shopify_id: order.shopifyId,
    order_number: order.orderNumber,
    created_at: order.createdAt,
    cancelled_at: order.cancelledAt,
    financial_status: order.financialStatus,
    fulfillment_status: order.fulfillmentStatus,
    tags: order.tags,
    buyer_name: order.buyerName,
    ebay_username: order.ebayUsername,
    ebay_order_id: order.ebayOrderId,
    amazon_order_id: order.amazonOrderId,
    amazon_deliver_by_at: order.amazonDeliverByAt,
    ebay_deliver_by_at: order.ebayDeliverByAt,
    ...shippingAddressToFields(order.shippingAddress),
    latitude: order.latitude,
    longitude: order.longitude,
    geocode_region: order.geocodeRegion,
    geocoded_at: order.geocodedAt,
    currency: order.currency,
    revenue: order.revenue,
    subtotal: order.subtotal,
    tax: order.tax,
    shipping_charged: order.shippingCharged,
    shipping_label_cost: order.shippingLabelCost,
    ebay_fee_rate: order.ebayFeeRate,
    ebay_ads_fee_rate: order.ebayAdsFeeRate,
    product_cost: order.productCost,
    product_cost_manual: order.productCostManual,
    shipping_service: order.shippingService,
    shipping_carrier: order.shippingCarrier,
    tracking_numbers: order.trackingNumbers ?? [],
    tracking_url: order.trackingUrl,
    shipment_status: order.shipmentStatus,
    delivered_at: order.deliveredAt,
    item_count: order.itemCount,
    cost: order.cost,
    profit: order.profit,
    synced_at: syncedAt,
  };
}

function rowToOrder(
  row: Database["public"]["Tables"]["orders"]["Row"],
  lineItems: Database["public"]["Tables"]["order_line_items"]["Row"][],
): StoredOrder {
  return {
    shopifyId: row.shopify_id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? null,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    tags: row.tags,
    buyerName: row.buyer_name,
    ebayUsername:
      row.ebay_username ??
      parseEbayUsernameForOrder({
        buyerName: row.buyer_name,
        tags: row.tags,
      }),
    ebayOrderId: row.ebay_order_id ?? null,
    amazonOrderId: row.amazon_order_id ?? null,
    amazonDeliverByAt: row.amazon_deliver_by_at ?? null,
    ebayDeliverByAt: row.ebay_deliver_by_at ?? null,
    shippingAddress: shippingAddressFromFields(row),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    geocodeRegion: row.geocode_region,
    geocodedAt: row.geocoded_at,
    currency: row.currency,
    revenue: Number(row.revenue),
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    shippingCharged: Number(row.shipping_charged),
    shippingLabelCost:
      row.shipping_label_cost != null
        ? Number(row.shipping_label_cost)
        : null,
    ebayFeeRate: row.ebay_fee_rate != null ? Number(row.ebay_fee_rate) : null,
    ebayAdsFeeRate:
      row.ebay_ads_fee_rate != null ? Number(row.ebay_ads_fee_rate) : null,
    productCost: row.product_cost != null ? Number(row.product_cost) : null,
    productCostManual: row.product_cost_manual ?? false,
    shippingService: row.shipping_service,
    shippingCarrier: row.shipping_carrier,
    trackingNumbers: row.tracking_numbers ?? [],
    trackingUrl: row.tracking_url,
    shipmentStatus: row.shipment_status ?? null,
    deliveredAt: row.delivered_at ?? null,
    itemCount: row.item_count,
    cost: row.cost != null ? Number(row.cost) : null,
    profit: row.profit != null ? Number(row.profit) : null,
    platformFee: null,
    lineItems: lineItems.map((item) => ({
      id: item.shopify_line_item_id,
      title: item.title,
      quantity: item.quantity,
      sku: item.sku,
      price: Number(item.price),
      productId: null,
      variantId: null,
      imageUrl: item.image_url,
      unitCost: null,
    })),
  };
}

/** Orders with line items — used to copy eBay fees/postage to new orders by SKU. */
export async function loadOrdersForSkuDefaults(): Promise<SkuDefaultSourceOrder[]> {
  const supabase = createSupabaseAdmin();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(
      "shopify_id, created_at, tags, shipping_label_cost, ebay_fee_rate, ebay_ads_fee_rate",
    )
    .order("created_at", { ascending: true });

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const { data: lineItems, error: itemsError } = await supabase
    .from("order_line_items")
    .select("shopify_order_id, title, sku");

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemsByOrder = new Map<
    number,
    Pick<SkuDefaultSourceOrder["lineItems"][number], "sku" | "title">[]
  >();
  for (const item of lineItems ?? []) {
    const list = itemsByOrder.get(item.shopify_order_id) ?? [];
    list.push({ sku: item.sku, title: item.title });
    itemsByOrder.set(item.shopify_order_id, list);
  }

  return (orders ?? []).map((row) => ({
    createdAt: row.created_at,
    tags: row.tags,
    ebayFeeRate:
      row.ebay_fee_rate != null ? Number(row.ebay_fee_rate) : null,
    ebayAdsFeeRate:
      row.ebay_ads_fee_rate != null ? Number(row.ebay_ads_fee_rate) : null,
    shippingLabelCost:
      row.shipping_label_cost != null
        ? Number(row.shipping_label_cost)
        : null,
    lineItems: itemsByOrder.get(row.shopify_id) ?? [],
  }));
}

export async function getOrdersFromSupabase(): Promise<OrdersDatabase> {
  const supabase = createSupabaseAdmin();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  if (!orders?.length) {
    const { data: lastSync } = await supabase
      .from("sync_runs")
      .select("completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return { syncedAt: lastSync?.completed_at ?? null, orders: [] };
  }

  const shopifyIds = orders.map((o) => o.shopify_id);
  const { data: lineItems, error: itemsError } = await supabase
    .from("order_line_items")
    .select("*")
    .in("shopify_order_id", shopifyIds);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemsByOrder = new Map<number, LineItemRow[]>();
  for (const item of lineItems ?? []) {
    const list = itemsByOrder.get(item.shopify_order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.shopify_order_id, list);
  }

  const syncedAt =
    orders.reduce<string | null>((latest, row) => {
      if (!latest || row.synced_at > latest) {
        return row.synced_at;
      }
      return latest;
    }, null) ?? null;

  return {
    syncedAt,
    orders: await applyProductCostsToOrders(
      orders.map((row) =>
        rowToOrder(row, itemsByOrder.get(row.shopify_id) ?? []),
      ),
    ),
  };
}

export async function deleteOrderFromSupabase(
  shopifyId: number,
): Promise<boolean> {
  const existing = await getOrderFromSupabase(shopifyId);
  if (!existing) {
    return false;
  }

  const supabase = createSupabaseAdmin();

  const { error: itemsError } = await supabase
    .from("order_line_items")
    .delete()
    .eq("shopify_order_id", shopifyId);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const { error: orderError } = await supabase
    .from("orders")
    .delete()
    .eq("shopify_id", shopifyId);

  if (orderError) {
    throw new Error(orderError.message);
  }

  await markOrderDeleted(shopifyId);
  return true;
}

export async function saveOrdersToSupabase(
  orders: StoredOrder[],
  syncedAt: string,
  stats?: {
    postageLabelsFound: number;
    trackingFound: number;
  },
): Promise<OrdersDatabase> {
  const supabase = createSupabaseAdmin();
  const deletedIds = await getDeletedOrderIds();
  const importableOrders = orders.filter(
    (order) => !deletedIds.has(order.shopifyId),
  );

  const { data: existingRows } = await supabase
    .from("orders")
    .select(
      "shopify_id, buyer_name, ebay_username, ebay_order_id, amazon_order_id, amazon_deliver_by_at, ebay_deliver_by_at, product_cost, product_cost_manual, shipping_label_cost, ebay_fee_rate, ebay_ads_fee_rate, shipping_address1, shipping_address2, shipping_city, shipping_province, shipping_zip, shipping_country, shipping_country_code, shipping_phone, latitude, longitude, geocode_region, geocoded_at",
    );

  const existingById = new Map(
    (existingRows ?? []).map((r) => [r.shopify_id, r]),
  );

  const defaultSource = await loadOrdersForSkuDefaults();
  const skuDefaults = buildSkuCostDefaultsFromOrders([
    ...defaultSource,
    ...importableOrders,
  ]);

  const merged = await applyProductCostsToOrders(
    applySkuCostDefaultsToOrders(
      importableOrders.map((order) => {
      const previous = existingById.get(order.shopifyId);
      const previousAddress = previous
        ? shippingAddressFromFields(previous)
        : null;

      const identity = mergeBuyerIdentityOnSync(previous, {
        buyerName: order.buyerName,
        ebayUsername: order.ebayUsername,
        tags: order.tags,
        parseEbayUsername: parseEbayUsernameForOrder,
      });

      const shippingAddress = mergeShippingAddressOnSync(
        previousAddress,
        order.shippingAddress,
      );

      const addressChanged =
        shippingAddressFingerprint(shippingAddress) !==
        shippingAddressFingerprint(previousAddress);

      return {
        ...order,
        buyerName: identity.buyerName,
        ebayUsername: identity.ebayUsername,
        ebayOrderId: order.ebayOrderId ?? previous?.ebay_order_id ?? null,
        amazonOrderId:
          order.amazonOrderId ?? previous?.amazon_order_id ?? null,
        amazonDeliverByAt:
          order.amazonDeliverByAt ?? previous?.amazon_deliver_by_at ?? null,
        ebayDeliverByAt:
          order.ebayDeliverByAt ?? previous?.ebay_deliver_by_at ?? null,
        shippingAddress,
        shippingLabelCost:
          order.shippingLabelCost ??
          (previous?.shipping_label_cost != null
            ? Number(previous.shipping_label_cost)
            : null),
        ebayFeeRate:
          order.ebayFeeRate ??
          (previous?.ebay_fee_rate != null
            ? Number(previous.ebay_fee_rate)
            : null),
        ebayAdsFeeRate:
          order.ebayAdsFeeRate ??
          (previous?.ebay_ads_fee_rate != null
            ? Number(previous.ebay_ads_fee_rate)
            : null),
        productCostManual:
          order.productCostManual || (previous?.product_cost_manual ?? false),
        productCost:
          order.productCostManual && order.productCost != null
            ? order.productCost
            : previous?.product_cost_manual && previous?.product_cost != null
              ? Number(previous.product_cost)
              : order.productCost,
        latitude: addressChanged
          ? null
          : previous?.latitude != null
            ? Number(previous.latitude)
            : order.latitude,
        longitude: addressChanged
          ? null
          : previous?.longitude != null
            ? Number(previous.longitude)
            : order.longitude,
        geocodeRegion: addressChanged
          ? null
          : previous?.geocode_region ?? order.geocodeRegion,
        geocodedAt: addressChanged
          ? null
          : previous?.geocoded_at ?? order.geocodedAt,
      };
      }),
      skuDefaults,
    ),
  );

  for (let i = 0; i < merged.length; i += BATCH_SIZE) {
    const batch = merged.slice(i, i + BATCH_SIZE);
    const rows = batch.map((o) => orderToRow(o, syncedAt));

    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(rows, { onConflict: "shopify_id" });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    const orderIds = batch.map((o) => o.shopifyId);

    const { error: deleteItemsError } = await supabase
      .from("order_line_items")
      .delete()
      .in("shopify_order_id", orderIds);

    if (deleteItemsError) {
      throw new Error(deleteItemsError.message);
    }

    const lineRows: LineItemInsert[] = batch.flatMap((order) =>
      order.lineItems.map((item) => ({
        shopify_line_item_id: item.id,
        shopify_order_id: order.shopifyId,
        title: item.title,
        quantity: item.quantity,
        sku: item.sku,
        price: item.price,
        image_url: item.imageUrl,
      })),
    );

    if (lineRows.length) {
      const { error: insertItemsError } = await supabase
        .from("order_line_items")
        .insert(lineRows);

      if (insertItemsError) {
        throw new Error(insertItemsError.message);
      }
    }
  }

  await supabase.from("sync_runs").insert({
    completed_at: syncedAt,
    orders_imported: merged.length,
    postage_labels_found: stats?.postageLabelsFound ?? 0,
    tracking_found: stats?.trackingFound ?? 0,
    status: "completed",
  });

  return getOrdersFromSupabase();
}

export async function getOrderFromSupabase(
  shopifyId: number,
): Promise<StoredOrder | null> {
  const supabase = createSupabaseAdmin();

  const { data: row, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("shopify_id", shopifyId)
    .maybeSingle();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (!row) {
    return null;
  }

  const { data: lineItems, error: itemsError } = await supabase
    .from("order_line_items")
    .select("*")
    .eq("shopify_order_id", shopifyId);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  return applyProductCostsToOrder(rowToOrder(row, lineItems ?? []));
}

export async function updateOrderCostsInSupabase(
  shopifyId: number,
  updates: {
    ebayFeeRate?: number | null;
    ebayAdsFeeRate?: number | null;
    shippingLabelCost?: number | null;
    productCost?: number | null;
    productCostManual?: boolean;
  },
): Promise<StoredOrder> {
  const supabase = createSupabaseAdmin();
  const existing = await getOrderFromSupabase(shopifyId);

  if (!existing) {
    throw new Error("Order not found");
  }

  const updated = await applyProductCostsToOrder({
    ...existing,
    ebayFeeRate:
      updates.ebayFeeRate !== undefined
        ? updates.ebayFeeRate
        : existing.ebayFeeRate,
    ebayAdsFeeRate:
      updates.ebayAdsFeeRate !== undefined
        ? updates.ebayAdsFeeRate
        : existing.ebayAdsFeeRate,
    shippingLabelCost:
      updates.shippingLabelCost !== undefined
        ? updates.shippingLabelCost
        : existing.shippingLabelCost,
    productCost:
      updates.productCost !== undefined
        ? updates.productCost
        : existing.productCost,
    productCostManual:
      updates.productCostManual !== undefined
        ? updates.productCostManual
        : existing.productCostManual,
  });

  const { error } = await supabase
    .from("orders")
    .update({
      ebay_fee_rate: updated.ebayFeeRate,
      ebay_ads_fee_rate: updated.ebayAdsFeeRate,
      shipping_label_cost: updated.shippingLabelCost,
      product_cost: updated.productCost,
      product_cost_manual: updated.productCostManual,
      cost: updated.cost,
      profit: updated.profit,
    })
    .eq("shopify_id", shopifyId);

  if (error) {
    throw new Error(error.message);
  }

  return updated;
}

export async function getOrderCountFromSupabase(): Promise<number> {
  const supabase = createSupabaseAdmin();
  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}
