import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";

export type AmazonFeeCategory =
  | "Referral / commission"
  | "FBA fulfilment"
  | "Storage"
  | "Advertising"
  | "Selling subscription"
  | "Refund administration"
  | "Other Amazon fees";

export type AmazonFeeLine = {
  category: AmazonFeeCategory;
  breakdownType: string;
  description: string;
  postedDate: string;
  orderId: string | null;
  amount: number;
  currency: string;
};

export type AmazonFeeCategoryTotal = {
  category: AmazonFeeCategory;
  amount: number;
  lineCount: number;
};

export type AmazonMonthlyFeesSummary = {
  year: number;
  month: number;
  label: string;
  postedAfter: string;
  postedBefore: string;
  currency: string;
  totalFees: number;
  categories: AmazonFeeCategoryTotal[];
  lines: AmazonFeeLine[];
  transactionCount: number;
  feeLineCount: number;
};

type Money = {
  currencyAmount?: number;
  currencyCode?: string;
};

type Breakdown = {
  breakdownType?: string;
  breakdownAmount?: Money;
  breakdowns?: Breakdown[];
};

type AmazonTransaction = {
  transactionId?: string;
  transactionType?: string;
  transactionStatus?: string;
  description?: string;
  postedDate?: string;
  totalAmount?: Money;
  relatedIdentifiers?: Array<{
    relatedIdentifierName?: string;
    relatedIdentifierValue?: string;
  }>;
  breakdowns?: Breakdown[];
  items?: Array<{
    description?: string;
    totalAmount?: Money;
    breakdowns?: Breakdown[];
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

const CATEGORY_ORDER: AmazonFeeCategory[] = [
  "Referral / commission",
  "FBA fulfilment",
  "Storage",
  "Advertising",
  "Selling subscription",
  "Refund administration",
  "Other Amazon fees",
];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function monthBounds(year: number, month: number): {
  postedAfter: Date;
  postedBefore: Date;
  label: string;
} {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Year must be between 2000 and 2100.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12.");
  }

  const postedAfter = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const postedBefore = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const label = postedAfter.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return { postedAfter, postedBefore, label };
}

function categorizeFee(breakdownType: string, description: string): AmazonFeeCategory {
  const haystack = `${breakdownType} ${description}`.toLowerCase();

  if (
    /commission|referral|sellingfees|variableclosing|fixedclosing|peritemfee/.test(
      haystack,
    )
  ) {
    return "Referral / commission";
  }
  if (
    /fba|fulfilichannel|fulfillment|fulfilichannel|weighthandling|pick.?pack|outbound/.test(
      haystack,
    )
  ) {
    return "FBA fulfilment";
  }
  if (/storage|agedinventory|long.?term/.test(haystack)) {
    return "Storage";
  }
  if (
    /sponsor|advertis|costofadvertising|sbv|sb_|sp_|sd_|coupon/.test(haystack)
  ) {
    return "Advertising";
  }
  if (/subscription|pro.?merchant|selling.?plan/.test(haystack)) {
    return "Selling subscription";
  }
  if (/refund.*admin|refundcommission|return.?shipping/.test(haystack)) {
    return "Refund administration";
  }
  return "Other Amazon fees";
}

function looksLikeFee(breakdownType: string, description: string): boolean {
  const haystack = `${breakdownType} ${description}`.toLowerCase();
  if (!haystack.trim()) return false;
  if (
    /principal|ourprice|productcharges|shippingcharge|tax|giftwrap|promotion|discount|sales/.test(
      haystack,
    ) &&
    !/fee|commission|fba|storage|sponsor|subscription/.test(haystack)
  ) {
    return false;
  }
  return /fee|commission|fba|storage|sponsor|advertis|subscription|closingfee|refundcommission|servicefee/.test(
    haystack,
  );
}

function walkBreakdowns(
  breakdowns: Breakdown[] | undefined,
  context: {
    postedDate: string;
    orderId: string | null;
    description: string;
    currencyFallback: string;
  },
  lines: AmazonFeeLine[],
) {
  if (!breakdowns?.length) return;

  for (const breakdown of breakdowns) {
    const type = breakdown.breakdownType?.trim() || "Fee";
    const amountRaw = Number(breakdown.breakdownAmount?.currencyAmount);
    const currency =
      breakdown.breakdownAmount?.currencyCode?.trim() ||
      context.currencyFallback;

    if (
      Number.isFinite(amountRaw) &&
      amountRaw !== 0 &&
      looksLikeFee(type, context.description)
    ) {
      lines.push({
        category: categorizeFee(type, context.description),
        breakdownType: type,
        description: context.description,
        postedDate: context.postedDate,
        orderId: context.orderId,
        amount: Math.abs(amountRaw),
        currency,
      });
    }

    walkBreakdowns(breakdown.breakdowns, context, lines);
  }
}

function extractFeesFromTransaction(
  transaction: AmazonTransaction,
): AmazonFeeLine[] {
  const postedDate = transaction.postedDate?.trim();
  if (!postedDate) return [];

  const description =
    transaction.description?.trim() ||
    transaction.transactionType?.trim() ||
    "Amazon fee";
  const orderId =
    transaction.relatedIdentifiers
      ?.find((item) => item.relatedIdentifierName === "ORDER_ID")
      ?.relatedIdentifierValue?.trim() || null;
  const currencyFallback =
    transaction.totalAmount?.currencyCode?.trim() || "GBP";
  const lines: AmazonFeeLine[] = [];

  walkBreakdowns(
    transaction.breakdowns,
    { postedDate, orderId, description, currencyFallback },
    lines,
  );

  for (const item of transaction.items ?? []) {
    walkBreakdowns(
      item.breakdowns,
      {
        postedDate,
        orderId,
        description: item.description?.trim() || description,
        currencyFallback:
          item.totalAmount?.currencyCode?.trim() || currencyFallback,
      },
      lines,
    );
  }

  // Standalone fee transactions with no nested fee breakdowns.
  if (!lines.length) {
    const type = transaction.transactionType?.trim() || "";
    const total = Number(transaction.totalAmount?.currencyAmount);
    if (
      Number.isFinite(total) &&
      total !== 0 &&
      looksLikeFee(type, description)
    ) {
      lines.push({
        category: categorizeFee(type, description),
        breakdownType: type || "Fee",
        description,
        postedDate,
        orderId,
        amount: Math.abs(total),
        currency: currencyFallback,
      });
    }
  }

  return lines;
}

function summarise(
  year: number,
  month: number,
  label: string,
  postedAfter: Date,
  postedBefore: Date,
  lines: AmazonFeeLine[],
  transactionCount: number,
): AmazonMonthlyFeesSummary {
  const currency = lines[0]?.currency || "GBP";
  const byCategory = new Map<AmazonFeeCategory, AmazonFeeCategoryTotal>();

  for (const category of CATEGORY_ORDER) {
    byCategory.set(category, { category, amount: 0, lineCount: 0 });
  }

  for (const line of lines) {
    const row = byCategory.get(line.category) ?? {
      category: line.category,
      amount: 0,
      lineCount: 0,
    };
    row.amount += line.amount;
    row.lineCount += 1;
    byCategory.set(line.category, row);
  }

  const categories = CATEGORY_ORDER.map(
    (category) => byCategory.get(category)!,
  ).filter((row) => row.lineCount > 0 || row.amount > 0);

  const totalFees = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    year,
    month,
    label,
    postedAfter: postedAfter.toISOString(),
    postedBefore: postedBefore.toISOString(),
    currency,
    totalFees: Number(totalFees.toFixed(2)),
    categories: categories.map((row) => ({
      ...row,
      amount: Number(row.amount.toFixed(2)),
    })),
    lines: lines.sort((a, b) => a.postedDate.localeCompare(b.postedDate)),
    transactionCount,
    feeLineCount: lines.length,
  };
}

/**
 * Pull Amazon seller fees for a calendar month via Finances listTransactions.
 */
export async function fetchAmazonMonthlyFees(
  year: number,
  month: number,
): Promise<AmazonMonthlyFeesSummary> {
  const { marketplaceId } = getAmazonConfig();
  const { postedAfter, postedBefore, label } = monthBounds(year, month);

  // Amazon rejects postedBefore within ~2 minutes of "now".
  const safeBefore = new Date(
    Math.min(postedBefore.getTime(), Date.now() - 3 * 60 * 1000),
  );
  if (safeBefore <= postedAfter) {
    throw new Error(
      "That month is too recent to pull yet. Try again in a few minutes, or pick a previous month.",
    );
  }

  const feeLines: AmazonFeeLine[] = [];
  let transactionCount = 0;
  let nextToken: string | undefined;

  for (let page = 0; page < 40; page += 1) {
    if (page > 0) await wait(500);

    let data: TransactionsResponse;
    try {
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: safeBefore.toISOString(),
          marketplaceId,
          nextToken,
        },
      });
    } catch (error) {
      if (!(error instanceof AmazonApiError) || error.status !== 429 || page === 0) {
        throw error;
      }
      await wait(2500);
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          postedAfter: postedAfter.toISOString(),
          postedBefore: safeBefore.toISOString(),
          marketplaceId,
          nextToken,
        },
      });
    }

    const transactions = data.payload?.transactions ?? data.transactions ?? [];
    transactionCount += transactions.length;
    for (const transaction of transactions) {
      feeLines.push(...extractFeesFromTransaction(transaction));
    }

    nextToken = data.payload?.nextToken ?? data.nextToken;
    if (!nextToken) break;
  }

  return summarise(
    year,
    month,
    label,
    postedAfter,
    postedBefore,
    feeLines,
    transactionCount,
  );
}

export function defaultFeesMonth(): { year: number; month: number } {
  const now = new Date();
  // Prefer last complete calendar month.
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    year: previous.getUTCFullYear(),
    month: previous.getUTCMonth() + 1,
  };
}
