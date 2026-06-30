import type { EbayTransaction } from "@/lib/ebay/client";

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

function orderIdsFromTransaction(transaction: EbayTransaction): string[] {
  const ids = new Set<string>();
  const primary = transaction.orderId?.trim();
  if (primary) {
    ids.add(primary);
  }

  for (const reference of transaction.references ?? []) {
    if (
      reference.referenceType?.toUpperCase() === "ORDER_ID" &&
      reference.referenceId?.trim()
    ) {
      ids.add(reference.referenceId.trim());
    }
  }

  return [...ids];
}

function breakdownFromTransaction(
  transaction: EbayTransaction,
): EbayOrderFeeBreakdown {
  const breakdown = emptyBreakdown();
  let hasLineItemFees = false;

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
    if (amount != null) {
      addFeeAmount(breakdown, amount, transaction.feeType);
      return breakdown;
    }
  }

  if (!hasLineItemFees) {
    const total = parseAmount(transaction.totalFeeAmount?.value);
    if (total != null) {
      addFeeAmount(breakdown, total);
    }
  }

  return breakdown;
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
