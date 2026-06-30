import {
  getDateRangeBounds,
  resolveDateRangeBounds,
  type DateRangeKey,
} from "@/lib/date-range";
import type { StoredOrder } from "@/lib/orders/types";

/** Fixed Amazon seller subscription (GBP per calendar month). */
export const AMAZON_SUBSCRIPTION_MONTHLY = Number(
  process.env.AMAZON_SUBSCRIPTION_MONTHLY ?? 30,
);

type Ymd = { year: number; month: number; day: number };

function parseYmd(ymd: string): Ymd {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function toYmd({ year, month, day }: Ymd): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayDiff(a: Ymd, b: Ymd): number {
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86_400_000);
}

function addMonths(ymd: Ymd, months: number): Ymd {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1 + months, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
  };
}

/** Prorate £30/mo across each calendar month touched by the range. */
export function amazonSubscriptionForBounds(
  startYmd: string,
  endYmd: string,
  monthlyRate = AMAZON_SUBSCRIPTION_MONTHLY,
): number {
  if (compareYmd(startYmd, endYmd) > 0) {
    return 0;
  }

  let total = 0;
  let cursor = parseYmd(startYmd);
  cursor = { year: cursor.year, month: cursor.month, day: 1 };

  while (true) {
    const dim = daysInMonth(cursor.year, cursor.month);
    const monthStart = toYmd({ year: cursor.year, month: cursor.month, day: 1 });
    const monthEnd = toYmd({ year: cursor.year, month: cursor.month, day: dim });

    const overlapStart =
      compareYmd(startYmd, monthStart) > 0 ? startYmd : monthStart;
    const overlapEnd = compareYmd(endYmd, monthEnd) < 0 ? endYmd : monthEnd;

    if (compareYmd(overlapStart, overlapEnd) <= 0) {
      const days =
        dayDiff(parseYmd(overlapStart), parseYmd(overlapEnd)) + 1;
      total += (days / dim) * monthlyRate;
    }

    if (compareYmd(monthEnd, endYmd) >= 0) {
      break;
    }

    cursor = addMonths(cursor, 1);
  }

  return Math.round(total * 100) / 100;
}

export function amazonSubscriptionForRange(
  range: DateRangeKey,
  orders: StoredOrder[],
  monthlyRate = AMAZON_SUBSCRIPTION_MONTHLY,
): number {
  const bounds = resolveDateRangeBounds(range, orders);
  if (!bounds) {
    return 0;
  }

  return amazonSubscriptionForBounds(
    bounds.startYmd,
    bounds.endYmd,
    monthlyRate,
  );
}

export function formatAmazonSubscriptionLabel(
  monthlyRate = AMAZON_SUBSCRIPTION_MONTHLY,
): string {
  return `Amazon subscription (${formatMoneyGbp(monthlyRate)}/mo)`;
}

function formatMoneyGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function amazonSubscriptionHint(
  range: DateRangeKey,
  amount: number,
  monthlyRate = AMAZON_SUBSCRIPTION_MONTHLY,
): string {
  const bounds = getDateRangeBounds(range);
  if (range === "all") {
    return `Prorated from first order to today · ${formatMoneyGbp(monthlyRate)}/month`;
  }
  if (bounds.startYmd === bounds.endYmd) {
    return `Daily share of ${formatMoneyGbp(monthlyRate)}/month`;
  }
  return `${formatMoneyGbp(amount)} for selected period · ${formatMoneyGbp(monthlyRate)}/month`;
}
