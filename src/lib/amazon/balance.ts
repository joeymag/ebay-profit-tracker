import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { AMAZON_MARKETPLACE_UK, getAmazonConfig } from "@/lib/amazon/config";

type CurrencyAmount = {
  CurrencyCode?: string;
  CurrencyAmount?: number;
};

type FinancialEventGroup = {
  ProcessingStatus?: string;
  FundTransferStatus?: string;
  OriginalTotal?: CurrencyAmount;
  FundTransferDate?: string;
  FinancialEventGroupStart?: string;
};

type FinancialEventGroupsResponse = {
  payload?: {
    NextToken?: string;
    FinancialEventGroupList?: FinancialEventGroup[];
  };
};

type DeferredTransaction = {
  totalAmount?: {
    currencyCode?: string;
    currencyAmount?: number;
  };
};

type TransactionsResponse = {
  nextToken?: string;
  transactions?: DeferredTransaction[];
  payload?: {
    nextToken?: string;
    transactions?: DeferredTransaction[];
  };
};

export type AmazonBalanceSummary = {
  currency: string;
  balance: number;
  deferred: number;
  total: number;
  payingOut: number;
  lastPayout: number | null;
  lastPayoutDate: string | null;
};

const MARKETPLACE_CURRENCY: Record<string, string> = {
  [AMAZON_MARKETPLACE_UK]: "GBP",
  A1PA6795UKMFR9: "EUR",
  A13V1IB3VIYZZH: "EUR",
  APJ6JRA9NG5V4: "EUR",
  A1RKKUPIHCS9HS: "EUR",
  A1805IZSGTT6HS: "EUR",
  AMEN7PMS3EDWL: "EUR",
  A2NODRKZP88ZB5: "SEK",
  A1C3SOZRARQ6R3: "PLN",
};

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function amountOf(value: CurrencyAmount | undefined): number | null {
  if (!value?.CurrencyCode) return null;
  const amount = Number(value.CurrencyAmount);
  return Number.isFinite(amount) ? amount : null;
}

function preferredCurrency(groups: FinancialEventGroup[]): string {
  const configured =
    MARKETPLACE_CURRENCY[getAmazonConfig().marketplaceId] ?? "GBP";
  const present = new Set(
    groups
      .map((group) => group.OriginalTotal?.CurrencyCode)
      .filter((code): code is string => Boolean(code)),
  );
  if (present.has(configured) || present.size === 0) return configured;
  return [...present][0] ?? configured;
}

function isPaidOut(status: string | undefined): boolean {
  const normalized = status?.toLowerCase();
  return normalized === "succeeded" || normalized === "successful";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sumDeferredTransactions(
  currency: string,
  marketplaceId: string,
): Promise<number> {
  const postedBefore = new Date(Date.now() - 3 * 60 * 1000);
  const postedAfter = new Date(
    postedBefore.getTime() - 179 * 24 * 60 * 60 * 1000,
  );
  let nextToken: string | undefined;
  let total = 0;

  for (let page = 0; page < 25; page += 1) {
    let data: TransactionsResponse;
    try {
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: postedBefore.toISOString(),
          marketplaceId,
          transactionStatus: "DEFERRED",
          nextToken,
        },
      });
    } catch (error) {
      if (!(error instanceof AmazonApiError) || error.status !== 429) throw error;
      await wait(2000);
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: postedBefore.toISOString(),
          marketplaceId,
          transactionStatus: "DEFERRED",
          nextToken,
        },
      });
    }

    const transactions = data.payload?.transactions ?? data.transactions ?? [];
    for (const transaction of transactions) {
      const code = transaction.totalAmount?.currencyCode;
      const amount = Number(transaction.totalAmount?.currencyAmount);
      if (code === currency && Number.isFinite(amount)) total += amount;
    }

    nextToken = data.payload?.nextToken ?? data.nextToken;
    if (!nextToken) break;
  }

  return total;
}

export async function getAmazonBalanceSummary(): Promise<AmazonBalanceSummary> {
  const startedAfter = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const groups: FinancialEventGroup[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const data = await amazonFetch<FinancialEventGroupsResponse>({
      path: "/finances/v0/financialEventGroups",
      query: {
        FinancialEventGroupStartedAfter: startedAfter.toISOString(),
        MaxResultsPerPage: "100",
        NextToken: nextToken,
      },
    });
    groups.push(...(data.payload?.FinancialEventGroupList ?? []));
    nextToken = data.payload?.NextToken;
    if (!nextToken) break;
  }

  const currency = preferredCurrency(groups);
  const marketplaceId = getAmazonConfig().marketplaceId;
  let deferred = 0;
  try {
    deferred = await sumDeferredTransactions(currency, marketplaceId);
  } catch {
    deferred = 0;
  }

  let balance = 0;
  let payingOut = 0;
  let lastPayout: number | null = null;
  let lastPayoutDate: string | null = null;

  for (const group of groups) {
    if (group.OriginalTotal?.CurrencyCode !== currency) continue;
    const amount = amountOf(group.OriginalTotal);
    if (amount == null) continue;

    if (group.ProcessingStatus === "Open") {
      balance += amount;
    }
    if (group.FundTransferStatus === "Processing") {
      payingOut += amount;
    }
    if (!isPaidOut(group.FundTransferStatus) || !group.FundTransferDate) {
      continue;
    }
    if (amount === 0) continue;

    const current = lastPayoutDate ? Date.parse(lastPayoutDate) : 0;
    const next = Date.parse(group.FundTransferDate);
    if (Number.isFinite(next) && next >= current) {
      lastPayout = roundMoney(amount);
      lastPayoutDate = group.FundTransferDate;
    }
  }

  const openBalance = roundMoney(balance);
  const deferredBalance = roundMoney(deferred);

  return {
    currency,
    balance: openBalance,
    deferred: deferredBalance,
    total: roundMoney(openBalance + deferredBalance),
    payingOut: roundMoney(payingOut),
    lastPayout,
    lastPayoutDate,
  };
}
