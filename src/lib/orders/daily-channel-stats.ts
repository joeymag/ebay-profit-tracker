import {
  resolveDateRangeBounds,
  type DateRangeKey,
} from "@/lib/date-range";
import { getSalesChannel, type SalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";

const TIMEZONE = "Europe/London";

type YmdParts = { year: number; month: number; day: number };

function getZonedParts(date: Date): YmdParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function toYmd({ year, month, day }: YmdParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ymdFromIso(iso: string): string {
  return toYmd(getZonedParts(new Date(iso)));
}

function addDays(parts: YmdParts, days: number): YmdParts {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12);
  return getZonedParts(new Date(utc));
}

function parseYmd(ymd: string): YmdParts {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month, day };
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function listDaysBetween(startYmd: string, endYmd: string): string[] {
  const days: string[] = [];
  let cursor = parseYmd(startYmd);
  const end = parseYmd(endYmd);

  while (true) {
    const ymd = toYmd(cursor);
    days.push(ymd);
    if (ymd === toYmd(end)) {
      break;
    }
    cursor = addDays(cursor, 1);
  }

  return days;
}

function formatDayLabel(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

type MutableDay = {
  ebayRevenue: number;
  amazonRevenue: number;
  ebayProfit: number;
  amazonProfit: number;
  ebayOrders: number;
  amazonOrders: number;
  ebayOrdersWithProfit: number;
  amazonOrdersWithProfit: number;
};

export type DailyChannelPoint = {
  date: string;
  label: string;
  ebayRevenue: number;
  amazonRevenue: number;
  totalRevenue: number;
  ebayProfit: number;
  amazonProfit: number;
  totalProfit: number;
  ebayOrders: number;
  amazonOrders: number;
  hasProfitData: boolean;
};

export type DailyChannelSummary = {
  points: DailyChannelPoint[];
  bestProfitDay: DailyChannelPoint | null;
  worstProfitDay: DailyChannelPoint | null;
  totalRevenue: number;
  totalProfit: number;
  daysWithProfitData: number;
};

function emptyDay(): MutableDay {
  return {
    ebayRevenue: 0,
    amazonRevenue: 0,
    ebayProfit: 0,
    amazonProfit: 0,
    ebayOrders: 0,
    amazonOrders: 0,
    ebayOrdersWithProfit: 0,
    amazonOrdersWithProfit: 0,
  };
}

function addOrderToDay(day: MutableDay, channel: SalesChannel, order: StoredOrder) {
  if (channel === "eBay") {
    day.ebayRevenue += order.revenue;
    day.ebayOrders += 1;
    if (order.profit != null) {
      day.ebayProfit += order.profit;
      day.ebayOrdersWithProfit += 1;
    }
    return;
  }

  if (channel === "Amazon") {
    day.amazonRevenue += order.revenue;
    day.amazonOrders += 1;
    if (order.profit != null) {
      day.amazonProfit += order.profit;
      day.amazonOrdersWithProfit += 1;
    }
  }
}

export function aggregateDailyChannelPerformance(
  orders: StoredOrder[],
  range: DateRangeKey,
): DailyChannelSummary {
  const bounds = resolveDateRangeBounds(range, orders);
  const byDay = new Map<string, MutableDay>();

  for (const order of orders) {
    const channel = getSalesChannel(order.tags);
    if (channel !== "eBay" && channel !== "Amazon") {
      continue;
    }

    const ymd = ymdFromIso(order.createdAt);
    if (bounds && (compareYmd(ymd, bounds.startYmd) < 0 || compareYmd(ymd, bounds.endYmd) > 0)) {
      continue;
    }

    const day = byDay.get(ymd) ?? emptyDay();
    addOrderToDay(day, channel, order);
    byDay.set(ymd, day);
  }

  const dayKeys =
    bounds != null
      ? listDaysBetween(bounds.startYmd, bounds.endYmd)
      : [...byDay.keys()].sort((a, b) => a.localeCompare(b));

  const points: DailyChannelPoint[] = dayKeys.map((date) => {
    const day = byDay.get(date) ?? emptyDay();
    const totalRevenue = day.ebayRevenue + day.amazonRevenue;
    const totalProfit = day.ebayProfit + day.amazonProfit;
    const hasProfitData =
      day.ebayOrdersWithProfit + day.amazonOrdersWithProfit > 0;

    return {
      date,
      label: formatDayLabel(date),
      ebayRevenue: day.ebayRevenue,
      amazonRevenue: day.amazonRevenue,
      totalRevenue,
      ebayProfit: day.ebayProfit,
      amazonProfit: day.amazonProfit,
      totalProfit,
      ebayOrders: day.ebayOrders,
      amazonOrders: day.amazonOrders,
      hasProfitData,
    };
  });

  const daysWithProfit = points.filter((p) => p.hasProfitData);
  const bestProfitDay =
    daysWithProfit.length > 0
      ? daysWithProfit.reduce((best, point) =>
          point.totalProfit > best.totalProfit ? point : best,
        )
      : null;
  const worstProfitDay =
    daysWithProfit.length > 0
      ? daysWithProfit.reduce((worst, point) =>
          point.totalProfit < worst.totalProfit ? point : worst,
        )
      : null;

  return {
    points,
    bestProfitDay,
    worstProfitDay,
    totalRevenue: points.reduce((sum, p) => sum + p.totalRevenue, 0),
    totalProfit: points.reduce((sum, p) => sum + p.totalProfit, 0),
    daysWithProfitData: daysWithProfit.length,
  };
}
