import type { AccountPayment } from "@/lib/accounting/payments";
import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";

type AmazonTransaction = {
  transactionId?: string;
  transactionType?: string;
  transactionStatus?: string;
  description?: string;
  postedDate?: string;
  totalAmount?: { currencyAmount?: number; currencyCode?: string };
  relatedIdentifiers?: Array<{
    relatedIdentifierName?: string;
    relatedIdentifierValue?: string;
  }>;
};

type TransactionsResponse = {
  nextToken?: string;
  transactions?: AmazonTransaction[];
  payload?: {
    nextToken?: string;
    transactions?: AmazonTransaction[];
  };
};

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listAmazonAccountPayments(days = 30): Promise<AccountPayment[]> {
  const { marketplaceId } = getAmazonConfig();
  const postedBefore = new Date(Date.now() - 3 * 60 * 1000);
  const postedAfter = new Date(postedBefore.getTime() - days * 24 * 60 * 60 * 1000);
  const payments: AccountPayment[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 6; page += 1) {
    if (page > 0) await wait(400);
    let data: TransactionsResponse;
    try {
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: postedBefore.toISOString(),
          marketplaceId,
          nextToken,
        },
      });
    } catch (error) {
      if (!(error instanceof AmazonApiError) || error.status !== 429 || page === 0) {
        throw error;
      }
      await wait(2000);
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: postedBefore.toISOString(),
          marketplaceId,
          nextToken,
        },
      });
    }

    const transactions = data.payload?.transactions ?? data.transactions ?? [];
    for (const transaction of transactions) {
      const date = transaction.postedDate?.trim();
      if (!date) continue;
      const amount = Number(transaction.totalAmount?.currencyAmount);
      const orderId = transaction.relatedIdentifiers?.find(
        (item) => item.relatedIdentifierName === "ORDER_ID",
      )?.relatedIdentifierValue;
      const type = transaction.transactionType?.trim() || "Transaction";
      payments.push({
        id: transaction.transactionId?.trim() || `${date}-${type}-${orderId ?? payments.length}`,
        date,
        type: titleCase(type),
        status: titleCase(transaction.transactionStatus?.trim() || "Posted"),
        reference: orderId?.trim() || null,
        description: transaction.description?.trim() || titleCase(type),
        amount: Number.isFinite(amount) ? amount : null,
        currency: transaction.totalAmount?.currencyCode?.trim() || "GBP",
      });
    }

    nextToken = data.payload?.nextToken ?? data.nextToken;
    if (!nextToken) break;
  }

  payments.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  return payments;
}
