import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { AMAZON_SUBSCRIPTION_MONTHLY } from "@/lib/orders/amazon-subscription";
import { PRODUCT_COST_VAT_RATE } from "@/lib/orders/product-cost-vat";

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
  /** Expense contribution: Amazon fee deduction (-£5) becomes +£5. Refunds net down. */
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
  /** Sum of order totals for orders placed this month. */
  settledProductSales: number;
  /** VAT rate applied on top of sold-for (default 20%). */
  vatRate: number;
  /** VAT amount added on top of sold-for. */
  vatOnSales: number;
  /** Sold-for plus VAT. */
  salesIncVat: number;
  /** Amazon orders placed this month. */
  orderCount: number;
  /** Orders that had no fee rows yet in Finances (too new / not settled). */
  ordersMissingFees: number;
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

function categorizeFee(breakdownType: string): AmazonFeeCategory {
  const type = breakdownType.toLowerCase();

  if (
    /commission|referral|sellingfees|variableclosing|fixedclosing|peritemfee/.test(
      type,
    )
  ) {
    return "Referral / commission";
  }
  if (
    /fba|multichannel|fulfillment|weighthandling|pick.?pack|outbound/.test(type)
  ) {
    return "FBA fulfilment";
  }
  if (/storage|agedinventory|long.?term/.test(type)) {
    return "Storage";
  }
  if (/sponsor|advertis|costofadvertising|sbv|sb_|sp_|sd_|coupon/.test(type)) {
    return "Advertising";
  }
  if (/subscription|pro.?merchant|selling.?plan/.test(type)) {
    return "Selling subscription";
  }
  if (/refund.*admin|refundcommission|return.?shipping/.test(type)) {
    return "Refund administration";
  }
  return "Other Amazon fees";
}

/** UK fee rows often nest as Commission → Base + Tax (VAT on the fee). */
function isFeeCompositionType(breakdownType: string): boolean {
  return /^(base|tax|basetax)$/i.test(breakdownType.trim());
}

/**
 * Match on breakdownType only — item titles often contain words like "FBA"
 * and must not turn Principal / Tax lines into fees.
 */
function looksLikeFeeType(breakdownType: string): boolean {
  const type = breakdownType.toLowerCase().trim();
  if (!type) return false;

  // Rollups — always walk into children (AmazonFees / Expenses / …).
  if (
    /^(amazonfees|expenses|sales|productcharges|shippingcharges|promotions|taxes|tax)$/i.test(
      type,
    )
  ) {
    return false;
  }

  if (
    /principal|ourprice|productcharge|shippingcharge|^tax$|basetax|shippingtax|giftwrap|promotion|discount|^sales$|^base$/i.test(
      type,
    ) &&
    !/fee|commission/i.test(type)
  ) {
    return false;
  }

  return /fee|commission|fba|storage|sponsor|advertis|subscription|closingfee|refundcommission|servicefee|csba/i.test(
    type,
  );
}

function childrenAreFeeComposition(children: Breakdown[]): boolean {
  return children.every((child) => {
    const type = child.breakdownType?.trim() || "";
    if (isFeeCompositionType(type)) return true;
    // DigitalServicesFee → DigitalServicesFee → Base/Tax
    const nested = child.breakdowns ?? [];
    return (
      looksLikeFeeType(type) &&
      nested.length > 0 &&
      childrenAreFeeComposition(nested)
    );
  });
}

/**
 * Amazon nests breakdowns so parents equal the sum of children.
 * Count fee nodes once; when Commission/FBA/etc. only have Base+Tax children,
 * take the parent amount (do not sum Base/Tax separately).
 *
 * Amount is expense contribution: Amazon fee deductions are negative in the
 * API, so we negate them (fee -£5 → expense £5). Fee refunds net down.
 */
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
    const children = breakdown.breakdowns ?? [];
    const amountRaw = Number(breakdown.breakdownAmount?.currencyAmount);
    const currency =
      breakdown.breakdownAmount?.currencyCode?.trim() ||
      context.currencyFallback;

    if (looksLikeFeeType(type)) {
      const takeHere =
        children.length === 0 || childrenAreFeeComposition(children);

      if (takeHere) {
        if (Number.isFinite(amountRaw) && amountRaw !== 0) {
          lines.push({
            category: categorizeFee(type),
            breakdownType: type,
            description: context.description,
            postedDate: context.postedDate,
            orderId: context.orderId,
            amount: Number((-amountRaw).toFixed(4)),
            currency,
          });
        }
        continue;
      }
    }

    if (children.length) {
      walkBreakdowns(children, context, lines);
    }
  }
}

function extractFeesFromTransaction(
  transaction: AmazonTransaction,
): AmazonFeeLine[] {
  const postedDate = transaction.postedDate?.trim();
  if (!postedDate) return [];

  // Deferred rows later reappear as RELEASED / DEFERRED_RELEASED — skip them.
  const status = transaction.transactionStatus?.trim().toUpperCase();
  if (status === "DEFERRED") return [];

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

  const items = transaction.items ?? [];

  // Item rows often only carry Principal/Tax. Selling fees (Commission, FBA, …)
  // usually sit on transaction.breakdowns — so only skip the transaction tree
  // when the items themselves already produced fee leaves.
  for (const item of items) {
    if (!item.breakdowns?.length) continue;
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

  if (!lines.length) {
    walkBreakdowns(
      transaction.breakdowns,
      { postedDate, orderId, description, currencyFallback },
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
      looksLikeFeeType(type || description)
    ) {
      lines.push({
        category: categorizeFee(type || description),
        breakdownType: type || "Fee",
        description,
        postedDate,
        orderId,
        amount: Number((-total).toFixed(4)),
        currency: currencyFallback,
      });
    }
  }

  return lines;
}

/** Exported for unit checks / local diagnostics. */
export function extractAmazonFeeLinesForTest(
  transaction: AmazonTransaction,
): AmazonFeeLine[] {
  return extractFeesFromTransaction(transaction);
}

function statusRank(status: string | undefined): number {
  switch (status?.trim().toUpperCase()) {
    case "RELEASED":
      return 3;
    case "DEFERRED_RELEASED":
      return 2;
    case "DEFERRED":
      return 0;
    default:
      return 1;
  }
}

function transactionOrderId(transaction: AmazonTransaction): string | null {
  return (
    transaction.relatedIdentifiers
      ?.find((item) => item.relatedIdentifierName === "ORDER_ID")
      ?.relatedIdentifierValue?.trim() || null
  );
}

/**
 * Same order often appears as DEFERRED_RELEASED then again as RELEASED with
 * identical Commission — keep one shipment/refund row per order.
 */
function dedupeFinanceTransactions(
  transactions: AmazonTransaction[],
): AmazonTransaction[] {
  const keyed = new Map<string, AmazonTransaction>();
  const passthrough: AmazonTransaction[] = [];

  for (const transaction of transactions) {
    if (statusRank(transaction.transactionStatus) === 0) continue;

    const type = transaction.transactionType?.trim() || "";
    const orderId = transactionOrderId(transaction);
    const dedupeType = type === "Shipment" || type === "Refund";

    if (!dedupeType || !orderId) {
      passthrough.push(transaction);
      continue;
    }

    const key = `${type}:${orderId}`;
    const existing = keyed.get(key);
    if (!existing) {
      keyed.set(key, transaction);
      continue;
    }

    const nextRank = statusRank(transaction.transactionStatus);
    const prevRank = statusRank(existing.transactionStatus);
    if (nextRank > prevRank) {
      keyed.set(key, transaction);
    } else if (
      nextRank === prevRank &&
      (transaction.postedDate || "") > (existing.postedDate || "")
    ) {
      keyed.set(key, transaction);
    }
  }

  return [...keyed.values(), ...passthrough];
}

function summarise(
  year: number,
  month: number,
  label: string,
  postedAfter: Date,
  postedBefore: Date,
  lines: AmazonFeeLine[],
  transactionCount: number,
  settledProductSales: number,
  orderCount: number,
  ordersMissingFees: number,
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
  ).filter((row) => row.lineCount > 0);

  const totalFees = lines.reduce((sum, line) => sum + line.amount, 0);
  const vatRate = PRODUCT_COST_VAT_RATE;
  const vatOnSales = Number((settledProductSales * vatRate).toFixed(2));
  const salesIncVat = Number((settledProductSales + vatOnSales).toFixed(2));

  return {
    year,
    month,
    label,
    postedAfter: postedAfter.toISOString(),
    postedBefore: postedBefore.toISOString(),
    currency,
    totalFees: Number(totalFees.toFixed(2)),
    settledProductSales,
    vatRate,
    vatOnSales,
    salesIncVat,
    orderCount,
    ordersMissingFees,
    categories: categories.map((row) => ({
      ...row,
      amount: Number(row.amount.toFixed(2)),
    })),
    lines: lines.sort((a, b) => a.postedDate.localeCompare(b.postedDate)),
    transactionCount,
    feeLineCount: lines.length,
  };
}

type AppAmazonOrder = {
  amazonOrderId: string;
  revenue: number;
};

type AmazonOrdersListResponse = {
  payload?: {
    Orders?: Array<{
      AmazonOrderId?: string;
      OrderStatus?: string;
      PurchaseDate?: string;
      OrderTotal?: { CurrencyCode?: string; Amount?: string };
    }>;
    NextToken?: string;
  };
};

/**
 * Orders placed in the calendar month — same set that flows into the app.
 */
async function listAmazonOrdersPlacedInMonth(
  year: number,
  month: number,
): Promise<AppAmazonOrder[]> {
  const { marketplaceId } = getAmazonConfig();
  const { postedAfter, postedBefore } = monthBounds(year, month);
  const seen = new Set<string>();
  const orders: AppAmazonOrder[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 20; page += 1) {
    if (page > 0) await wait(400);
    const data = await amazonFetch<AmazonOrdersListResponse>({
      path: "/orders/v0/orders",
      query: {
        MarketplaceIds: marketplaceId,
        CreatedAfter: postedAfter.toISOString(),
        CreatedBefore: postedBefore.toISOString(),
        MaxResultsPerPage: "50",
        NextToken: nextToken,
      },
    });

    for (const order of data.payload?.Orders ?? []) {
      const amazonOrderId = order.AmazonOrderId?.trim();
      if (!amazonOrderId || seen.has(amazonOrderId)) continue;
      if ((order.OrderStatus || "").toUpperCase() === "CANCELED") continue;
      seen.add(amazonOrderId);
      const revenue = Number(order.OrderTotal?.Amount);
      orders.push({
        amazonOrderId,
        revenue: Number.isFinite(revenue) ? revenue : 0,
      });
    }

    nextToken = data.payload?.NextToken;
    if (!nextToken) break;
  }

  return orders;
}

async function listTransactionsForOrder(
  orderId: string,
  marketplaceId: string,
): Promise<AmazonTransaction[]> {
  const collected: AmazonTransaction[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    if (page > 0) await wait(500);
    let data: TransactionsResponse;
    try {
      data = await amazonFetch<TransactionsResponse>({
        path: "/finances/2024-06-19/transactions",
        query: {
          marketplaceId,
          relatedIdentifierName: "ORDER_ID",
          relatedIdentifierValue: orderId,
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
          marketplaceId,
          relatedIdentifierName: "ORDER_ID",
          relatedIdentifierValue: orderId,
          nextToken,
        },
      });
    }

    collected.push(...(data.payload?.transactions ?? data.transactions ?? []));
    nextToken = data.payload?.nextToken ?? data.nextToken;
    if (!nextToken) break;
  }

  return collected;
}

async function fetchMonthSubscriptionFee(
  year: number,
  month: number,
  marketplaceId: string,
): Promise<AmazonFeeLine[]> {
  const { postedAfter, postedBefore } = monthBounds(year, month);
  const safeBefore = new Date(
    Math.min(postedBefore.getTime(), Date.now() - 3 * 60 * 1000),
  );
  if (safeBefore <= postedAfter) return [];

  const collected: AmazonTransaction[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    if (page > 0) await wait(500);
    const data = await amazonFetch<TransactionsResponse>({
      path: "/finances/2024-06-19/transactions",
      query: {
        postedAfter: postedAfter.toISOString(),
        postedBefore: safeBefore.toISOString(),
        marketplaceId,
        nextToken,
      },
    });
    collected.push(...(data.payload?.transactions ?? data.transactions ?? []));
    nextToken = data.payload?.nextToken ?? data.nextToken;
    if (!nextToken) break;
  }

  const lines = dedupeFinanceTransactions(collected)
    .flatMap((transaction) => extractFeesFromTransaction(transaction))
    .filter((line) => line.category === "Selling subscription");

  if (lines.length) return lines;

  // Fallback if Amazon has not posted the subscription row yet.
  return [
    {
      category: "Selling subscription",
      breakdownType: "SubscriptionFee",
      description: "Subscription (configured monthly rate)",
      postedDate: postedAfter.toISOString(),
      orderId: null,
      amount: AMAZON_SUBSCRIPTION_MONTHLY,
      currency: "GBP",
    },
  ];
}

/**
 * Fees for Amazon orders placed in the calendar month (same orders that come
 * into the app). Looks up each order’s Finances rows by ORDER_ID, then adds
 * the month’s selling subscription.
 */
export async function fetchAmazonMonthlyFees(
  year: number,
  month: number,
): Promise<AmazonMonthlyFeesSummary> {
  const { marketplaceId } = getAmazonConfig();
  const { postedAfter, postedBefore, label } = monthBounds(year, month);
  const appOrders = await listAmazonOrdersPlacedInMonth(year, month);

  const collected: AmazonTransaction[] = [];
  let ordersMissingFees = 0;

  for (let index = 0; index < appOrders.length; index += 1) {
    if (index > 0) await wait(2100); // Finances listTransactions ~0.5 rps
    const order = appOrders[index]!;
    const txs = await listTransactionsForOrder(order.amazonOrderId, marketplaceId);
    const feeLines = dedupeFinanceTransactions(txs).flatMap((transaction) =>
      extractFeesFromTransaction(transaction),
    );
    if (!feeLines.length) ordersMissingFees += 1;
    collected.push(...txs);
  }

  await wait(2100);
  const subscriptionLines = await fetchMonthSubscriptionFee(
    year,
    month,
    marketplaceId,
  );

  const transactions = dedupeFinanceTransactions(collected);
  const orderFeeLines = transactions.flatMap((transaction) =>
    extractFeesFromTransaction(transaction),
  );
  // Drop any subscription that somehow appeared on an order txn; we add month fee once.
  const feeLines = [
    ...orderFeeLines.filter((line) => line.category !== "Selling subscription"),
    ...subscriptionLines,
  ];

  const orderedSales = Number(
    appOrders.reduce((sum, order) => sum + order.revenue, 0).toFixed(2),
  );

  return summarise(
    year,
    month,
    label,
    postedAfter,
    postedBefore,
    feeLines,
    collected.length,
    orderedSales,
    appOrders.length,
    ordersMissingFees,
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
