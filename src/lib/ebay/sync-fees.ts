import { fetchEbayTransactionsInRange } from "@/lib/ebay/client";
import {
  aggregateEbayFeesByOrderId,
  roundMoney,
} from "@/lib/ebay/parse-fees";
import { withComputedFinancials } from "@/lib/orders/financials";
import type { StoredOrder } from "@/lib/orders/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";

export type SyncEbayFeesResult = {
  ok: true;
  days: number;
  transactionsFetched: number;
  ebayOrders: number;
  matched: number;
  updated: number;
  unmatchedOrderIds: number;
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
    (row): row is EbayOrderRow =>
      Boolean(row.ebay_order_id?.trim()),
  );

  const transactions = await fetchEbayTransactionsInRange(start, end);
  const feesByOrderId = aggregateEbayFeesByOrderId(transactions);
  const syncedAt = new Date().toISOString();
  let matched = 0;
  let updated = 0;

  for (const row of ebayOrders) {
    const ebayOrderId = row.ebay_order_id.trim();
    const feeBreakdown = feesByOrderId.get(ebayOrderId);
    if (!feeBreakdown) {
      continue;
    }

    matched += 1;
    const ebayFeesActual = roundMoney(feeBreakdown.total);
    const ebayAdsFeeActual = roundMoney(feeBreakdown.ads);

    const order: StoredOrder = {
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

    const computed = withComputedFinancials(order);
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        ebay_fees_actual: ebayFeesActual,
        ebay_ads_fee_actual: ebayAdsFeeActual,
        ebay_fees_synced_at: syncedAt,
        cost: computed.cost,
        profit: computed.profit,
      })
      .eq("shopify_id", row.shopify_id);

    if (!updateError) {
      updated += 1;
    }
  }

  return {
    ok: true,
    days,
    transactionsFetched: transactions.length,
    ebayOrders: ebayOrders.length,
    matched,
    updated,
    unmatchedOrderIds: ebayOrders.length - matched,
    syncedAt,
  };
}
