import { amazonFetch } from "@/lib/amazon/client";

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

export type AmazonBalanceSummary = {
  currency: string;
  balance: number;
  payingOut: number;
  lastPayout: number | null;
  lastPayoutDate: string | null;
};

function amountOf(value: CurrencyAmount | undefined, currency: string): number {
  if (!value || value.CurrencyCode !== currency) return 0;
  const amount = Number(value.CurrencyAmount);
  return Number.isFinite(amount) ? amount : 0;
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

  const currency =
    groups.find((group) => group.OriginalTotal?.CurrencyCode)?.OriginalTotal
      ?.CurrencyCode || "GBP";

  let balance = 0;
  let payingOut = 0;
  let lastPayout: number | null = null;
  let lastPayoutDate: string | null = null;

  for (const group of groups) {
    const amount = amountOf(group.OriginalTotal, currency);
    if (group.ProcessingStatus === "Open") {
      balance += amount;
    }
    if (group.FundTransferStatus === "Processing") {
      payingOut += amount;
    }
    if (group.FundTransferStatus === "Succeeded" && group.FundTransferDate) {
      const current = lastPayoutDate ? Date.parse(lastPayoutDate) : 0;
      const next = Date.parse(group.FundTransferDate);
      if (Number.isFinite(next) && next >= current) {
        lastPayout = amount;
        lastPayoutDate = group.FundTransferDate;
      }
    }
  }

  return {
    currency,
    balance: Math.round(balance * 100) / 100,
    payingOut: Math.round(payingOut * 100) / 100,
    lastPayout,
    lastPayoutDate,
  };
}
