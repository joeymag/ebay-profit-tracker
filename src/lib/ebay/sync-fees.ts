import {
  fetchEbayTransactionsForOrderVariants,
  fetchEbayTransactionsInRange,
} from "@/lib/ebay/client";
import {
  aggregateEbayFeesByOrderId,
  lookupEbayFeeBreakdown,
  roundMoney,
  sumEbayFeesFromTransactions,
  type EbayOrderFeeBreakdown,
} from "@/lib/ebay/parse-fees";
import { ebayOrderIdLookupVariants } from "@/lib/ebay/order-id";
import { withComputedFinancials } from "@/lib/orders/financials";
import type { StoredOrder } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export type SyncEbayFeesResult = {
  ok: true;
  days: number;
  transactionsFetched: number;
  ebayOrders: number;
  matched: number;
  perOrderMatched: number;
  updated: number;
  updateFailures: number;
  unmatchedOrderIds: number;
  missingEbayOrderId: number;
  sampleUnmatchedOrderIds: string[];
  sampleTransactionOrderIds: string[];
  syncedAt: string;
};

type EbayOrderRow = {
  shopify_id: number;
  ebay_order_id: string;
  tags: string | null;
  revenue: number;
  product_cost: number | null;
  product_cost_manual: boolean;
  shipping_label_cost: number | null;
  ebay_fee_rate: number | null;
  ebay_ads_fee_rate: number | null;
  ebay_fees_actual: number | null;
};

const UPDATE_CHUNK_SIZE = 25;
const PER_ORDER_LOOKUP_DELAY_MS = 200;
const MAX_PER_ORDER_LOOKUPS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildStoredOrderFromRow(
  row: EbayOrderRow,
  ebayOrderId: string,
  ebayFeesActual: number,
  ebayAdsFeeActual: number,
  syncedAt: string,
): StoredOrder {
  return {
    shopifyId: row.shopify_id,
    orderNumber: "",
    createdAt: syncedAt,
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
    shippingLabelCost:
      row.shipping_label_cost != null
        ? Number(row.shipping_label_cost)
        : null,
    ebayFeeRate: row.ebay_fee_rate != null ? Number(row.ebay_fee_rate) : null,
    ebayAdsFeeRate:
      row.ebay_ads_fee_rate != null ? Number(row.ebay_ads_fee_rate) : null,
    ebayFeesActual,
    ebayAdsFeeActual,
    ebayFeesSyncedAt: syncedAt,
    productCost: row.product_cost != null ? Number(row.product_cost) : null,
    productCostManual: row.product_cost_manual ?? false,
    shippingService: null,
    shippingCarrier: null,
    trackingNumbers: [],
    trackingUrl: null,
    shipmentStatus: null,
    deliveredAt: null,
    itemCount: 0,
    platformFee: null,
    cost: null,
    profit: null,
    lineItems: [],
  };
}

function registerFeeBreakdown(
  feesByOrderId: Map<string, EbayOrderFeeBreakdown>,
  ebayOrderId: string,
  breakdown: EbayOrderFeeBreakdown,
) {
  for (const variant of ebayOrderIdLookupVariants(ebayOrderId)) {
    feesByOrderId.set(variant, breakdown);
  }
}

export async function syncEbayFeesFromFinancesApi(options?: {
  days?: number;
}): Promise<SyncEbayFeesResult> {
  const days = Math.min(Math.max(options?.days ?? 120, 1), 365);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);

  const supabase = createSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("orders")
    .select(
      "shopify_id, ebay_order_id, tags, revenue, product_cost, product_cost_manual, shipping_label_cost, ebay_fee_rate, ebay_ads_fee_rate, ebay_fees_actual",
    )
    .not("ebay_order_id", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const ebayOrders = (rows ?? []).filter(
    (row): row is EbayOrderRow => Boolean(row.ebay_order_id?.trim()),
  );

  const { count: missingEbayOrderIdCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .is("ebay_order_id", null)
    .ilike("tags", "%ebay%");

  const transactions = await fetchEbayTransactionsInRange(start, end);
  const feesByOrderId = aggregateEbayFeesByOrderId(transactions);
  const syncedAt = new Date().toISOString();
  let matched = 0;
  let perOrderMatched = 0;
  let updated = 0;
  let updateFailures = 0;

  const unmatchedRows = ebayOrders.filter(
    (row) =>
      !lookupEbayFeeBreakdown(feesByOrderId, row.ebay_order_id.trim()),
  );

  for (const row of unmatchedRows.slice(0, MAX_PER_ORDER_LOOKUPS)) {
    const ebayOrderId = row.ebay_order_id.trim();

    try {
      const orderTransactions =
        await fetchEbayTransactionsForOrderVariants(ebayOrderId);
      const breakdown = sumEbayFeesFromTransactions(orderTransactions);
      if (breakdown.total <= 0) {
        continue;
      }

      registerFeeBreakdown(feesByOrderId, ebayOrderId, breakdown);
      perOrderMatched += 1;
    } catch {
      // Try the next order; bulk sync should still succeed for matched rows.
    }

    await sleep(PER_ORDER_LOOKUP_DELAY_MS);
  }

  const pendingUpdates: Array<{
    shopifyId: number;
    payload: {
      ebay_fees_actual: number;
      ebay_ads_fee_actual: number;
      ebay_fees_synced_at: string;
      cost: number | null;
      profit: number | null;
    };
  }> = [];

  for (const row of ebayOrders) {
    const ebayOrderId = row.ebay_order_id.trim();
    const feeBreakdown = lookupEbayFeeBreakdown(feesByOrderId, ebayOrderId);
    if (!feeBreakdown) {
      continue;
    }

    matched += 1;
    const ebayFeesActual = roundMoney(feeBreakdown.total);
    const ebayAdsFeeActual = roundMoney(feeBreakdown.ads);

    const order = buildStoredOrderFromRow(
      row,
      ebayOrderId,
      ebayFeesActual,
      ebayAdsFeeActual,
      syncedAt,
    );
    const computed = withComputedFinancials(order);
    pendingUpdates.push({
      shopifyId: row.shopify_id,
      payload: {
        ebay_fees_actual: ebayFeesActual,
        ebay_ads_fee_actual: ebayAdsFeeActual,
        ebay_fees_synced_at: syncedAt,
        cost: computed.cost,
        profit: computed.profit,
      },
    });
  }

  for (let index = 0; index < pendingUpdates.length; index += UPDATE_CHUNK_SIZE) {
    const chunk = pendingUpdates.slice(index, index + UPDATE_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((entry) =>
        supabase
          .from("orders")
          .update(entry.payload)
          .eq("shopify_id", entry.shopifyId),
      ),
    );

    for (const result of results) {
      if (result.error) {
        updateFailures += 1;
      } else {
        updated += 1;
      }
    }
  }

  const matchedOrderIdSet = new Set<string>();
  for (const row of ebayOrders) {
    if (lookupEbayFeeBreakdown(feesByOrderId, row.ebay_order_id.trim())) {
      matchedOrderIdSet.add(row.ebay_order_id.trim());
    }
  }

  const sampleUnmatchedOrderIds = ebayOrders
    .map((row) => row.ebay_order_id.trim())
    .filter((orderId) => !matchedOrderIdSet.has(orderId))
    .slice(0, 5);

  const sampleTransactionOrderIds = transactions
    .map((transaction) => transaction.orderId?.trim())
    .filter((orderId): orderId is string => Boolean(orderId))
    .slice(0, 5);

  return {
    ok: true,
    days,
    transactionsFetched: transactions.length,
    ebayOrders: ebayOrders.length,
    matched,
    perOrderMatched,
    updated,
    updateFailures,
    unmatchedOrderIds: ebayOrders.length - matched,
    missingEbayOrderId: missingEbayOrderIdCount ?? 0,
    sampleUnmatchedOrderIds,
    sampleTransactionOrderIds,
    syncedAt,
  };
}
