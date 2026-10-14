import type { AccountPayment } from "@/lib/accounting/payments";
import {
  ebayFinancesFetch,
  type EbayTransaction,
  type EbayTransactionsResponse,
} from "@/lib/ebay/client";

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function signedAmount(transaction: EbayTransaction): number | null {
  const value = Number(transaction.amount?.value);
  if (!Number.isFinite(value)) return null;
  return transaction.bookingEntry?.toUpperCase() === "DEBIT" ? -Math.abs(value) : value;
}

function toPayment(transaction: EbayTransaction): AccountPayment | null {
  const date = transaction.transactionDate?.trim();
  if (!date) return null;
  const type = transaction.transactionType?.trim() || "Transaction";
  const description =
    transaction.transactionMemo?.trim() ||
    (transaction.feeType ? titleCase(transaction.feeType) : titleCase(type));
  return {
    id: transaction.transactionId?.trim() || `${date}-${type}-${transaction.orderId ?? ""}`,
    date,
    type: titleCase(type),
    status: transaction.bookingEntry ? titleCase(transaction.bookingEntry) : "Posted",
    reference: transaction.orderId?.trim() || null,
    description,
    amount: signedAmount(transaction),
    currency: transaction.amount?.currency?.trim() || "GBP",
  };
}

export async function listEbayAccountPayments(days = 30): Promise<AccountPayment[]> {
  const end = new Date(Date.now() - 2 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const filter = encodeURIComponent(
    `transactionDate:[${start.toISOString()}..${end.toISOString()}]`,
  );
  const payments: AccountPayment[] = [];

  for (let page = 0; page < 3; page += 1) {
    const data = await ebayFinancesFetch<EbayTransactionsResponse>(
      `/transaction?filter=${filter}&limit=200&offset=${page * 200}`,
    );
    const batch = data.transactions ?? [];
    for (const transaction of batch) {
      const payment = toPayment(transaction);
      if (payment) payments.push(payment);
    }
    if (batch.length < 200) break;
  }

  payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  return payments;
}
