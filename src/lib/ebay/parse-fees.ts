import type { EbayTransaction } from "@/lib/ebay/client";

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

function feeFromTransaction(transaction: EbayTransaction): number {
  const fromTotal = parseAmount(transaction.totalFeeAmount?.value);
  if (fromTotal != null && fromTotal > 0) {
    return fromTotal;
  }

  let total = 0;
  for (const lineItem of transaction.orderLineItems ?? []) {
    for (const fee of lineItem.marketplaceFees ?? []) {
      const amount = parseAmount(fee.amount?.value);
      if (amount != null) {
        total += amount;
      }
    }
  }

  return total;
}

/** Sum eBay fees per marketplace order ID from Finances API transactions. */
export function aggregateEbayFeesByOrderId(
  transactions: EbayTransaction[],
): Map<string, number> {
  const feesByOrderId = new Map<string, number>();

  for (const transaction of transactions) {
    const orderId = transaction.orderId?.trim();
    if (!orderId) {
      continue;
    }

    const feeAmount = feeFromTransaction(transaction);
    if (feeAmount <= 0) {
      continue;
    }

    feesByOrderId.set(orderId, (feesByOrderId.get(orderId) ?? 0) + feeAmount);
  }

  return feesByOrderId;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
