import { fetchEbayTransactionsInRange } from "@/lib/ebay/client";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  getEbayShippingFulfillments,
  normalizeEbayCarrierCode,
} from "@/lib/ebay/fulfillment-client";
import {
  aggregateShippingLabelCostsByOrderId,
  lookupShippingLabelCost,
} from "@/lib/ebay/parse-shipping-labels";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import { withComputedFinancials } from "@/lib/orders/financials";
import type { StoredOrder } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type EbayPostageEnrichOptions = {
  /** Only consider orders created within this many days. */
  recentDays?: number;
  /** Cap eBay Fulfillment API calls (tracking). */
  maxFulfillmentLookups?: number;
  /**
   * When true, only fill postage/tracking when missing
   * (never overwrite Shopify label cost or existing tracking).
   */
  onlyMissing?: boolean;
};

export type EbayPostageEnrichResult = {
  orders: StoredOrder[];
  postageApplied: number;
  trackingApplied: number;
  labelTransactions: number;
  fulfillmentLookups: number;
  skipped: boolean;
  skipReason?: string;
};

export type SyncEbayPostageResult = {
  ok: true;
  days: number;
  ebayOrders: number;
  postageUpdated: number;
  trackingUpdated: number;
  labelTransactions: number;
  fulfillmentLookups: number;
  skipped: boolean;
  skipReason?: string;
  syncedAt: string;
};

const DEFAULT_RECENT_DAYS = 60;
const DEFAULT_MAX_FULFILLMENT = 40;
const FULFILLMENT_DELAY_MS = 150;
const UPDATE_CHUNK_SIZE = 25;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecentOrder(order: StoredOrder, recentDays: number): boolean {
  const created = Date.parse(order.createdAt);
  if (!Number.isFinite(created)) return true;
  const cutoff = Date.now() - recentDays * 24 * 60 * 60 * 1000;
  return created >= cutoff;
}

function needsPostage(order: StoredOrder): boolean {
  return order.shippingLabelCost == null || order.shippingLabelCost <= 0;
}

function needsTracking(order: StoredOrder): boolean {
  return !order.trackingNumbers?.length;
}

function mergeTracking(
  existing: string[],
  incoming: string[],
): string[] {
  const set = new Set(
    [...existing, ...incoming].map((n) => n.trim()).filter(Boolean),
  );
  return [...set];
}

/**
 * Apply eBay Finances SHIPPING_LABEL costs + Fulfillment API tracking
 * onto in-memory orders (after Shopify postage enrichment).
 */
export async function enrichOrdersWithEbayPostageAndTracking(
  orders: StoredOrder[],
  options: EbayPostageEnrichOptions = {},
): Promise<EbayPostageEnrichResult> {
  const recentDays = options.recentDays ?? DEFAULT_RECENT_DAYS;
  const maxFulfillmentLookups =
    options.maxFulfillmentLookups ?? DEFAULT_MAX_FULFILLMENT;
  const onlyMissing = options.onlyMissing ?? true;

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return {
      orders,
      postageApplied: 0,
      trackingApplied: 0,
      labelTransactions: 0,
      fulfillmentLookups: 0,
      skipped: true,
      skipReason: "eBay not connected",
    };
  }

  const ebayOrders = orders
    .filter((o) => Boolean(o.ebayOrderId?.trim()))
    .filter((o) => isRecentOrder(o, recentDays))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (!ebayOrders.length) {
    return {
      orders,
      postageApplied: 0,
      trackingApplied: 0,
      labelTransactions: 0,
      fulfillmentLookups: 0,
      skipped: false,
    };
  }

  const needCost = ebayOrders.filter(
    (o) => !onlyMissing || needsPostage(o),
  );
  const needTrack = ebayOrders.filter(
    (o) => !onlyMissing || needsTracking(o),
  );

  let costsByOrderId = new Map<string, number>();
  let labelTransactions = 0;

  if (needCost.length) {
    try {
      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - recentDays);
      const transactions = await fetchEbayTransactionsInRange(start, end, {
        transactionType: "SHIPPING_LABEL",
      });
      labelTransactions = transactions.length;
      costsByOrderId = aggregateShippingLabelCostsByOrderId(transactions);
    } catch (error) {
      console.error(
        "[ebay-postage] Finances SHIPPING_LABEL fetch failed:",
        error instanceof EbayApiError
          ? `${error.message} ${error.body ?? ""}`
          : error,
      );
    }
  }

  const trackingByShopifyId = new Map<
    number,
    { trackingNumbers: string[]; carrier: string | null }
  >();
  let fulfillmentLookups = 0;

  for (const order of needTrack.slice(0, maxFulfillmentLookups)) {
    const ebayOrderId = order.ebayOrderId!.trim();
    try {
      fulfillmentLookups += 1;
      const fulfillments = await getEbayShippingFulfillments(ebayOrderId);
      const numbers = fulfillments
        .map((f) => f.shipmentTrackingNumber?.trim())
        .filter((n): n is string => Boolean(n));
      if (!numbers.length) {
        await sleep(FULFILLMENT_DELAY_MS);
        continue;
      }
      const carrier =
        normalizeEbayCarrierCode(
          fulfillments.find((f) => f.shippingCarrierCode)?.shippingCarrierCode,
        ) ?? null;
      trackingByShopifyId.set(order.shopifyId, {
        trackingNumbers: numbers,
        carrier,
      });
    } catch (error) {
      if (
        error instanceof EbayApiError &&
        (error.status === 403 || error.status === 401)
      ) {
        console.error(
          "[ebay-postage] Fulfillment API auth failed — reconnect eBay with sell.fulfillment scope:",
          error.body ?? error.message,
        );
        break;
      }
      console.error(
        `[ebay-postage] Fulfillment lookup failed for ${ebayOrderId}:`,
        error instanceof EbayApiError ? error.message : error,
      );
    }
    await sleep(FULFILLMENT_DELAY_MS);
  }

  let postageApplied = 0;
  let trackingApplied = 0;

  const ordersEnriched = orders.map((order) => {
    if (!order.ebayOrderId?.trim()) {
      return order;
    }

    let next = order;
    let changed = false;

    const labelCost = lookupShippingLabelCost(
      costsByOrderId,
      order.ebayOrderId,
    );
    if (
      labelCost != null &&
      labelCost > 0 &&
      (!onlyMissing || needsPostage(order))
    ) {
      // Never overwrite a Shopify (or manual) postage cost already present.
      if (needsPostage(order)) {
        next = withComputedFinancials({
          ...next,
          shippingLabelCost: labelCost,
        });
        postageApplied += 1;
        changed = true;
      }
    }

    const tracking = trackingByShopifyId.get(order.shopifyId);
    if (tracking?.trackingNumbers.length) {
      const merged = mergeTracking(
        onlyMissing ? order.trackingNumbers : [],
        tracking.trackingNumbers,
      );
      const hadTracking = order.trackingNumbers.length > 0;
      if (!hadTracking || merged.length > order.trackingNumbers.length) {
        next = {
          ...next,
          trackingNumbers: hadTracking
            ? mergeTracking(order.trackingNumbers, tracking.trackingNumbers)
            : tracking.trackingNumbers,
          shippingCarrier:
            next.shippingCarrier ?? tracking.carrier ?? order.shippingCarrier,
        };
        if (!hadTracking) {
          trackingApplied += 1;
        }
        changed = true;
      }
    }

    return changed ? next : order;
  });

  return {
    orders: ordersEnriched,
    postageApplied,
    trackingApplied,
    labelTransactions,
    fulfillmentLookups,
    skipped: false,
  };
}

/**
 * Backfill eBay postage + tracking onto stored orders (cron / fee sync companion).
 */
export async function syncEbayPostageFromApis(options?: {
  days?: number;
  maxFulfillmentLookups?: number;
}): Promise<SyncEbayPostageResult> {
  const days = Math.min(Math.max(options?.days ?? 30, 1), 120);
  const maxFulfillmentLookups =
    options?.maxFulfillmentLookups ?? DEFAULT_MAX_FULFILLMENT;
  const syncedAt = new Date().toISOString();

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return {
      ok: true,
      days,
      ebayOrders: 0,
      postageUpdated: 0,
      trackingUpdated: 0,
      labelTransactions: 0,
      fulfillmentLookups: 0,
      skipped: true,
      skipReason: "eBay not connected",
      syncedAt,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      days,
      ebayOrders: 0,
      postageUpdated: 0,
      trackingUpdated: 0,
      labelTransactions: 0,
      fulfillmentLookups: 0,
      skipped: true,
      skipReason: "Supabase not configured",
      syncedAt,
    };
  }

  const supabase = createSupabaseAdmin();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      "shopify_id, ebay_order_id, shipping_label_cost, tracking_numbers, shipping_carrier, revenue, product_cost, product_cost_manual, tags, ebay_fee_rate, ebay_ads_fee_rate, ebay_fees_actual, ebay_ads_fee_actual, created_at",
    )
    .not("ebay_order_id", "is", null)
    .gte("created_at", cutoff.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  type Row = {
    shopify_id: number;
    ebay_order_id: string;
    shipping_label_cost: number | null;
    tracking_numbers: string[] | null;
    shipping_carrier: string | null;
    revenue: number;
    product_cost: number | null;
    product_cost_manual: boolean;
    tags: string | null;
    ebay_fee_rate: number | null;
    ebay_ads_fee_rate: number | null;
    ebay_fees_actual: number | null;
    ebay_ads_fee_actual: number | null;
    created_at: string;
  };

  const ebayOrders: Row[] = [];
  for (const row of rows ?? []) {
    if (!row.ebay_order_id?.trim()) continue;
    ebayOrders.push({
      shopify_id: row.shopify_id,
      ebay_order_id: row.ebay_order_id,
      shipping_label_cost: row.shipping_label_cost,
      tracking_numbers: row.tracking_numbers ?? null,
      shipping_carrier: row.shipping_carrier,
      revenue: Number(row.revenue),
      product_cost: row.product_cost,
      product_cost_manual: row.product_cost_manual ?? false,
      tags: row.tags,
      ebay_fee_rate: row.ebay_fee_rate,
      ebay_ads_fee_rate: row.ebay_ads_fee_rate,
      ebay_fees_actual: row.ebay_fees_actual,
      ebay_ads_fee_actual: row.ebay_ads_fee_actual,
      created_at: row.created_at,
    });
  }

  let costsByOrderId = new Map<string, number>();
  let labelTransactions = 0;

  const needCost = ebayOrders.filter(
    (row) =>
      row.shipping_label_cost == null || Number(row.shipping_label_cost) <= 0,
  );

  if (needCost.length) {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    const transactions = await fetchEbayTransactionsInRange(start, end, {
      transactionType: "SHIPPING_LABEL",
    });
    labelTransactions = transactions.length;
    costsByOrderId = aggregateShippingLabelCostsByOrderId(transactions);
  }

  const needTrack = ebayOrders.filter(
    (row) => !row.tracking_numbers?.length,
  );

  const trackingByShopifyId = new Map<
    number,
    { trackingNumbers: string[]; carrier: string | null }
  >();
  let fulfillmentLookups = 0;

  for (const row of needTrack.slice(0, maxFulfillmentLookups)) {
    try {
      fulfillmentLookups += 1;
      const fulfillments = await getEbayShippingFulfillments(
        row.ebay_order_id.trim(),
      );
      const numbers = fulfillments
        .map((f) => f.shipmentTrackingNumber?.trim())
        .filter((n): n is string => Boolean(n));
      if (numbers.length) {
        trackingByShopifyId.set(row.shopify_id, {
          trackingNumbers: numbers,
          carrier: normalizeEbayCarrierCode(
            fulfillments.find((f) => f.shippingCarrierCode)?.shippingCarrierCode,
          ),
        });
      }
    } catch (error) {
      if (
        error instanceof EbayApiError &&
        (error.status === 403 || error.status === 401)
      ) {
        console.error(
          "[ebay-postage] Fulfillment API auth failed — reconnect eBay:",
          error.body ?? error.message,
        );
        break;
      }
    }
    await sleep(FULFILLMENT_DELAY_MS);
  }

  const pendingUpdates: Array<{
    shopifyId: number;
    payload: {
      shipping_label_cost?: number;
      tracking_numbers?: string[];
      shipping_carrier?: string;
      cost?: number | null;
      profit?: number | null;
    };
  }> = [];

  let postageUpdated = 0;
  let trackingUpdated = 0;

  for (const row of ebayOrders) {
    const payload: {
      shipping_label_cost?: number;
      tracking_numbers?: string[];
      shipping_carrier?: string;
      cost?: number | null;
      profit?: number | null;
    } = {};
    const ebayOrderId = row.ebay_order_id.trim();
    const labelCost = lookupShippingLabelCost(costsByOrderId, ebayOrderId);
    const missingPostage =
      row.shipping_label_cost == null || Number(row.shipping_label_cost) <= 0;

    if (missingPostage && labelCost != null && labelCost > 0) {
      payload.shipping_label_cost = labelCost;
      postageUpdated += 1;

      // Recompute cost/profit when we can.
      const stub: StoredOrder = {
        shopifyId: row.shopify_id,
        orderNumber: "",
        createdAt: row.created_at,
        cancelledAt: null,
        financialStatus: "paid",
        fulfillmentStatus: null,
        tags: row.tags,
        buyerName: null,
        ebayUsername: null,
        ebayOrderId,
        amazonOrderId: null,
        amazonDeliverByAt: null,
        ebayDeliverByAt: null,
        shippingAddress: null,
        latitude: null,
        longitude: null,
        geocodeRegion: null,
        geocodedAt: null,
        currency: "GBP",
        revenue: Number(row.revenue),
        subtotal: Number(row.revenue),
        tax: 0,
        shippingCharged: 0,
        shippingLabelCost: labelCost,
        shippingLabelGid: null,
        ebayFeeRate:
          row.ebay_fee_rate != null ? Number(row.ebay_fee_rate) : null,
        ebayAdsFeeRate:
          row.ebay_ads_fee_rate != null ? Number(row.ebay_ads_fee_rate) : null,
        ebayFeesActual:
          row.ebay_fees_actual != null ? Number(row.ebay_fees_actual) : null,
        ebayAdsFeeActual:
          row.ebay_ads_fee_actual != null
            ? Number(row.ebay_ads_fee_actual)
            : null,
        ebayFeesSyncedAt: null,
        productCost:
          row.product_cost != null ? Number(row.product_cost) : null,
        productCostManual: row.product_cost_manual ?? false,
        shippingService: null,
        shippingCarrier: row.shipping_carrier,
        trackingNumbers: row.tracking_numbers ?? [],
        trackingUrl: null,
        shipmentStatus: null,
        deliveredAt: null,
        itemCount: 0,
        platformFee: null,
        cost: null,
        profit: null,
        lineItems: [],
      };
      const computed = withComputedFinancials(stub);
      payload.cost = computed.cost;
      payload.profit = computed.profit;
    }

    const tracking = trackingByShopifyId.get(row.shopify_id);
    if (tracking?.trackingNumbers.length && !row.tracking_numbers?.length) {
      payload.tracking_numbers = tracking.trackingNumbers;
      if (!row.shipping_carrier && tracking.carrier) {
        payload.shipping_carrier = tracking.carrier;
      }
      trackingUpdated += 1;
    }

    if (Object.keys(payload).length) {
      pendingUpdates.push({ shopifyId: row.shopify_id, payload });
    }
  }

  for (let i = 0; i < pendingUpdates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = pendingUpdates.slice(i, i + UPDATE_CHUNK_SIZE);
    await Promise.all(
      chunk.map((entry) =>
        supabase
          .from("orders")
          .update(entry.payload)
          .eq("shopify_id", entry.shopifyId),
      ),
    );
  }

  return {
    ok: true,
    days,
    ebayOrders: ebayOrders.length,
    postageUpdated,
    trackingUpdated,
    labelTransactions,
    fulfillmentLookups,
    skipped: false,
    syncedAt,
  };
}
