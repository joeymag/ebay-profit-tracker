import { withComputedFinancials } from "@/lib/orders/financials";
import { parseEbayUsernameForOrder } from "@/lib/orders/ebay-buyer";
import { resolveLineItemSkuForDisplay } from "@/lib/orders/line-item-sku";
import { shippingAddressFromFields } from "@/lib/orders/shipping-address";
import {
  applyCatalogToOrder,
  applyCatalogToOrders,
  buildPostageCatalog,
  buildProductCatalog,
} from "@/lib/products/costs";
import { fetchAllLineItemsFromSupabase } from "@/lib/orders/fetch-line-items";
import { getProductCatalog } from "@/lib/products/store";
import type { StoredOrder } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fetchTemuSkuUnitCostAliases } from "@/lib/temu/link-temu-products";

async function loadCostCatalogs() {
  const catalogRows = await getProductCatalog();
  const temuAliases = await fetchTemuSkuUnitCostAliases();
  const withAliases = [
    ...catalogRows,
    ...temuAliases.map((alias) => ({
      sku: alias.temuSku,
      unitCost: alias.unitCost,
      defaultPostage: alias.defaultPostage,
      temuSku: alias.temuSku,
    })),
  ];
  return {
    catalog: buildProductCatalog(withAliases),
    postage: buildPostageCatalog(withAliases),
  };
}

export async function applyProductCostsToOrders(
  orders: StoredOrder[],
): Promise<StoredOrder[]> {
  const { catalog, postage } = await loadCostCatalogs();
  return applyCatalogToOrders(orders, catalog, postage).map(withComputedFinancials);
}

export async function applyProductCostsToOrder(
  order: StoredOrder,
): Promise<StoredOrder> {
  const { catalog, postage } = await loadCostCatalogs();
  return withComputedFinancials(applyCatalogToOrder(order, catalog, postage));
}

/** Persist recalculated product_cost / cost / profit for all orders (Supabase only). */
export async function recalculateAllOrderProductCosts(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const supabase = createSupabaseAdmin();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("shopify_id");

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  if (!orders?.length) {
    return 0;
  }

  const shopifyIds = orders.map((o) => o.shopify_id);
  const shopifyIdSet = new Set(shopifyIds);
  const allLineItems = await fetchAllLineItemsFromSupabase();

  const { data: orderRows, error: fullError } = await supabase
    .from("orders")
    .select("*")
    .in("shopify_id", shopifyIds);

  if (fullError) {
    throw new Error(fullError.message);
  }

  const itemsByOrder = new Map<number, typeof allLineItems>();
  for (const item of allLineItems) {
    if (!shopifyIdSet.has(item.shopify_order_id)) {
      continue;
    }
    const list = itemsByOrder.get(item.shopify_order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.shopify_order_id, list);
  }

  const { catalog, postage } = await loadCostCatalogs();

  const updates: {
    shopify_id: number;
    product_cost: number | null;
    shipping_label_cost: number | null;
    fillPostage: boolean;
    cost: number | null;
    profit: number | null;
  }[] = [];

  for (const row of orderRows ?? []) {
    const items = itemsByOrder.get(row.shopify_id) ?? [];
    const productCost = applyCatalogToOrder(
      {
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
        temuOrderId: row.temu_order_id ?? null,
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
        shippingLabelGid: row.shipping_label_gid ?? null,
        ebayFeeRate: row.ebay_fee_rate != null ? Number(row.ebay_fee_rate) : null,
        ebayAdsFeeRate:
          row.ebay_ads_fee_rate != null ? Number(row.ebay_ads_fee_rate) : null,
        ebayFeesActual:
          row.ebay_fees_actual != null ? Number(row.ebay_fees_actual) : null,
        ebayAdsFeeActual:
          row.ebay_ads_fee_actual != null ? Number(row.ebay_ads_fee_actual) : null,
        ebayFeesSyncedAt: row.ebay_fees_synced_at ?? null,
        productCost:
          row.product_cost_manual && row.product_cost != null
            ? Number(row.product_cost)
            : null,
        productCostManual: row.product_cost_manual ?? false,
        shippingService: row.shipping_service,
        shippingCarrier: row.shipping_carrier,
        trackingNumbers: row.tracking_numbers ?? [],
        trackingUrl: row.tracking_url,
        shipmentStatus: row.shipment_status ?? null,
        deliveredAt: row.delivered_at ?? null,
        itemCount: row.item_count,
        cost: null,
        profit: null,
        platformFee: null,
        lineItems: items.map((item) => ({
          id: item.shopify_line_item_id,
          title: item.title,
          quantity: item.quantity,
          sku: resolveLineItemSkuForDisplay(item.sku, item.title, item.temu_sku),
          temuSku: item.temu_sku,
          price: Number(item.price),
          productId: null,
          variantId: null,
          imageUrl: item.image_url,
          unitCost: null,
        })),
      },
      catalog,
      postage,
    );

    const computed = withComputedFinancials(productCost);
    updates.push({
      shopify_id: row.shopify_id,
      product_cost: computed.productCost,
      shipping_label_cost: computed.shippingLabelCost,
      fillPostage: row.shipping_label_cost == null && computed.shippingLabelCost != null,
      cost: computed.cost,
      profit: computed.profit,
    });
  }

  for (let i = 0; i < updates.length; i += 100) {
    const batch = updates.slice(i, i + 100);
    for (const row of batch) {
      const source = orderRows?.find((o) => o.shopify_id === row.shopify_id);
      const updatePayload: {
        product_cost?: number | null;
        shipping_label_cost?: number | null;
        cost: number | null;
        profit: number | null;
      } = {
        cost: row.cost,
        profit: row.profit,
      };

      if (!source?.product_cost_manual) {
        updatePayload.product_cost = row.product_cost;
      }
      if (row.fillPostage) {
        updatePayload.shipping_label_cost = row.shipping_label_cost;
      }

      const { error } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("shopify_id", row.shopify_id);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  return updates.length;
}
