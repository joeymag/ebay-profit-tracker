import type { EbayTransaction } from "@/lib/ebay/client";
import {
  ebayOrderIdLookupVariants,
  normalizeEbayOrderIdKey,
} from "@/lib/ebay/order-id";

function parseAmount(value: string | undefined): number {
  if (!value?.trim()) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Net eBay shipping-label cost for an order (debits minus credits/refunds).
 */
export function shippingLabelCostFromTransactions(
  transactions: EbayTransaction[],
): number | null {
  let total = 0;
  let sawLabel = false;

  for (const tx of transactions) {
    const type = (tx.transactionType ?? "").toUpperCase();
    if (type !== "SHIPPING_LABEL") continue;

    sawLabel = true;
    const amount = Math.abs(parseAmount(tx.amount?.value));
    const entry = (tx.bookingEntry ?? "").toUpperCase();

    if (entry === "CREDIT") {
      total -= amount;
    } else {
      // DEBIT or unspecified — treat as seller charge.
      total += amount;
    }
  }

  if (!sawLabel) return null;
  const rounded = roundMoney(total);
  return rounded > 0 ? rounded : rounded === 0 ? 0 : null;
}

/** Map eBay order id (all lookup variants) → net shipping label cost. */
export function aggregateShippingLabelCostsByOrderId(
  transactions: EbayTransaction[],
): Map<string, number> {
  const byOrder = new Map<string, EbayTransaction[]>();

  for (const tx of transactions) {
    const type = (tx.transactionType ?? "").toUpperCase();
    if (type !== "SHIPPING_LABEL") continue;
    const orderId = tx.orderId?.trim();
    if (!orderId) continue;
    const key = normalizeEbayOrderIdKey(orderId);
    const list = byOrder.get(key) ?? [];
    list.push(tx);
    byOrder.set(key, list);
  }

  const costs = new Map<string, number>();
  for (const [normalizedId, txs] of byOrder) {
    const cost = shippingLabelCostFromTransactions(txs);
    if (cost == null || cost <= 0) continue;
    for (const variant of ebayOrderIdLookupVariants(normalizedId)) {
      costs.set(variant, cost);
    }
  }
  return costs;
}

export function lookupShippingLabelCost(
  costsByOrderId: Map<string, number>,
  ebayOrderId: string,
): number | undefined {
  for (const variant of ebayOrderIdLookupVariants(ebayOrderId)) {
    const cost =
      costsByOrderId.get(variant) ??
      costsByOrderId.get(normalizeEbayOrderIdKey(variant));
    if (cost != null && cost > 0) {
      return cost;
    }
  }
  return undefined;
}
