import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { withComputedFinancials } from "@/lib/orders/financials";
import { fetchFulfillmentsForOrders } from "@/lib/shopify/fulfillments";
import { enrichStoredOrderWithFulfillments } from "@/lib/shopify/shipping";
import { fetchShippingLabelCostsForOrders } from "@/lib/shopify/shipping-labels";
import type { StoredOrder } from "@/lib/orders/types";

/** Shopify IDs that already have a stored postage / label cost. */
export async function getShopifyIdsWithPostageCost(
  shopifyIds: number[],
): Promise<Set<number>> {
  const unique = [...new Set(shopifyIds)];
  if (!unique.length || !isSupabaseConfigured()) {
    return new Set();
  }

  const supabase = createSupabaseAdmin();
  const withCost = new Set<number>();

  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from("orders")
      .select("shopify_id, shipping_label_cost")
      .in("shopify_id", batch)
      .not("shipping_label_cost", "is", null);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of data ?? []) {
      if (row.shipping_label_cost != null && Number(row.shipping_label_cost) > 0) {
        withCost.add(row.shopify_id);
      }
    }
  }

  return withCost;
}

export type PostageEnrichOptions = {
  /**
   * When true, skip Shopify event lookups for orders that already have
   * shipping_label_cost stored (keeps quick sync fast).
   */
  onlyMissingPostage?: boolean;
  concurrency?: number;
};

/**
 * Pull tracking + Shopify Shipping label purchase costs onto orders.
 * Used by auto/quick sync so postage bought in Shopify is applied automatically.
 */
export async function enrichOrdersWithPostageAndTracking(
  orders: StoredOrder[],
  options: PostageEnrichOptions = {},
): Promise<{
  orders: StoredOrder[];
  withPostage: number;
  withTracking: number;
}> {
  const fulfilledIds = orders
    .filter(
      (order) =>
        order.fulfillmentStatus === "fulfilled" ||
        order.fulfillmentStatus === "partial",
    )
    .map((order) => order.shopifyId);

  if (!fulfilledIds.length) {
    const withTracking = orders.filter((o) => o.trackingNumbers.length > 0)
      .length;
    const withPostage = orders.filter(
      (o) => o.shippingLabelCost != null && o.shippingLabelCost > 0,
    ).length;
    return { orders, withPostage, withTracking };
  }

  const fulfillmentsMap = await fetchFulfillmentsForOrders(fulfilledIds, {
    concurrency: options.concurrency ?? 8,
  });

  const labelCandidateIds = [
    ...new Set([...fulfilledIds, ...fulfillmentsMap.keys()]),
  ];

  let labelLookupIds = labelCandidateIds;
  if (options.onlyMissingPostage) {
    const alreadyHave = await getShopifyIdsWithPostageCost(labelCandidateIds);
    labelLookupIds = labelCandidateIds.filter((id) => !alreadyHave.has(id));
  }

  const labelCosts =
    labelLookupIds.length > 0
      ? await fetchShippingLabelCostsForOrders(labelLookupIds, {
          concurrency: 3,
        })
      : new Map<number, number>();

  const ordersEnriched = orders.map((order) => {
    const fulfillmentData = fulfillmentsMap.get(order.shopifyId);
    const fulfillments = fulfillmentData?.fulfillments;
    let next = order;

    if (fulfillments?.length) {
      next = enrichStoredOrderWithFulfillments(
        order,
        fulfillments,
        fulfillmentData?.deliveredAt ?? null,
      );
    }

    const labelCost = labelCosts.get(order.shopifyId);
    if (labelCost != null && labelCost > 0) {
      next = withComputedFinancials({
        ...next,
        shippingLabelCost: labelCost,
      });
    }

    return next;
  });

  const withPostage = ordersEnriched.filter(
    (o) => o.shippingLabelCost != null && o.shippingLabelCost > 0,
  ).length;
  const withTracking = ordersEnriched.filter(
    (o) => o.trackingNumbers.length > 0,
  ).length;

  return { orders: ordersEnriched, withPostage, withTracking };
}
