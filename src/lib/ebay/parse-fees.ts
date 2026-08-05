import type { EbayTransaction } from "@/lib/ebay/client";
import {
  ebayOrderIdLookupVariants,
  normalizeEbayOrderIdKey,
} from "@/lib/ebay/order-id";

export type EbayOrderFeeBreakdown = {
  total: number;
  ads: number;
  selling: number;
};

const EBAY_AD_FEE_TYPES = new Set([
  "AD_FEE",
  "PREMIUM_AD_FEES",
  "PROMOTED_LISTING_FEE",
  "PROMOTED_OFFSITE_FEE",
]);

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

export function isEbayAdFeeType(feeType: string | undefined): boolean {
  if (!feeType) {
    return false;
  }

  const normalized = feeType.trim().toUpperCase();
  if (EBAY_AD_FEE_TYPES.has(normalized)) {
    return true;
  }

  return normalized.includes("AD_FEE") || normalized.includes("PROMOTED");
}

function emptyBreakdown(): EbayOrderFeeBreakdown {
  return { total: 0, ads: 0, selling: 0 };
}

function addFeeAmount(
  breakdown: EbayOrderFeeBreakdown,
  amount: number,
  feeType?: string,
) {
  if (amount <= 0) {
    return;
  }

  breakdown.total += amount;
  if (isEbayAdFeeType(feeType)) {
    breakdown.ads += amount;
  } else {
    breakdown.selling += amount;
  }
}

/** @deprecated Import from `@/lib/ebay/order-id` instead. */
export { normalizeEbayOrderIdKey, ebayOrderIdLookupVariants } from "@/lib/ebay/order-id";

const ORDER_REFERENCE_TYPES = new Set([
  "ORDER_ID",
  "LEGACY_ORDER_ID",
  "ORDER",
  "SALES_RECORD",
]);

function isOrderReferenceType(referenceType: string | undefined): boolean {
  if (!referenceType) {
    return false;
  }

  const normalized = referenceType.trim().toUpperCase();
  if (ORDER_REFERENCE_TYPES.has(normalized)) {
    return true;
  }

  return normalized.includes("ORDER");
}

function registerOrderId(ids: Set<string>, orderId: string) {
  const trimmed = orderId.trim();
  if (!trimmed) {
    return;
  }

  ids.add(trimmed);
  ids.add(normalizeEbayOrderIdKey(trimmed));
  for (const variant of ebayOrderIdLookupVariants(trimmed)) {
    ids.add(variant);
    ids.add(normalizeEbayOrderIdKey(variant));
  }
}

function orderIdsFromTransaction(transaction: EbayTransaction): string[] {
  const ids = new Set<string>();
  const primary = transaction.orderId?.trim();
  if (primary) {
    registerOrderId(ids, primary);
  }

  for (const reference of transaction.references ?? []) {
    if (
      isOrderReferenceType(reference.referenceType) &&
      reference.referenceId?.trim()
    ) {
      registerOrderId(ids, reference.referenceId);
    }
  }

  return [...ids];
}

export function lookupEbayFeeBreakdown(
  feesByOrderId: Map<string, EbayOrderFeeBreakdown>,
  ebayOrderId: string,
): EbayOrderFeeBreakdown | undefined {
  const trimmed = ebayOrderId.trim();
  if (!trimmed) {
    return undefined;
  }

  return (
    feesByOrderId.get(trimmed) ??
    feesByOrderId.get(normalizeEbayOrderIdKey(trimmed))
  );
}

function breakdownFromTransaction(
  transaction: EbayTransaction,
): EbayOrderFeeBreakdown {
  const breakdown = emptyBreakdown();
  let hasLineItemFees = false;
  const transactionType = transaction.transactionType?.trim().toUpperCase();

  for (const lineItem of transaction.orderLineItems ?? []) {
    for (const fee of lineItem.marketplaceFees ?? []) {
      const amount = parseAmount(fee.amount?.value);
      if (amount == null) {
        continue;
      }

      hasLineItemFees = true;
      addFeeAmount(breakdown, amount, fee.feeType);
    }
  }

  if (transaction.feeType) {
    const amount = parseAmount(transaction.amount?.value);
    if (amount != null && amount > 0) {
      addFeeAmount(breakdown, amount, transaction.feeType);
      return breakdown;
    }
  }

  if (!hasLineItemFees) {
    const total = parseAmount(transaction.totalFeeAmount?.value);
    if (total != null && total > 0) {
      addFeeAmount(breakdown, total);
    }
  }

  // Some fee-only rows omit line items but still carry totalFeeAmount on SALE rows.
  if (
    breakdown.total <= 0 &&
    transactionType === "SALE" &&
    !transaction.feeType
  ) {
    const total = parseAmount(transaction.totalFeeAmount?.value);
    if (total != null && total > 0) {
      addFeeAmount(breakdown, total);
    }
  }

  return breakdown;
}

/** Sum fees from transactions returned by a per-order Finances API lookup. */
export function sumEbayFeesFromTransactions(
  transactions: EbayTransaction[],
): EbayOrderFeeBreakdown {
  const combined = emptyBreakdown();

  for (const breakdown of aggregateEbayFeesByOrderId(transactions).values()) {
    combined.total += breakdown.total;
    combined.ads += breakdown.ads;
    combined.selling += breakdown.selling;
  }

  return combined;
}

/** Sum eBay fees per marketplace order ID, split into total / ads / selling. */
export function aggregateEbayFeesByOrderId(
  transactions: EbayTransaction[],
): Map<string, EbayOrderFeeBreakdown> {
  const feesByOrderId = new Map<string, EbayOrderFeeBreakdown>();

  for (const transaction of transactions) {
    const breakdown = breakdownFromTransaction(transaction);
    if (breakdown.total <= 0) {
      continue;
    }

    for (const orderId of orderIdsFromTransaction(transaction)) {
      const existing = feesByOrderId.get(orderId) ?? emptyBreakdown();
      feesByOrderId.set(orderId, {
        total: existing.total + breakdown.total,
        ads: existing.ads + breakdown.ads,
        selling: existing.selling + breakdown.selling,
      });
    }
  }

  return feesByOrderId;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
