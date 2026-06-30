import type { StoredOrder } from "@/lib/orders/types";

export type DateRangeKey =
  | "all"
  | "today"
  | "week"
  | "last-week"
  | "last-month"
  | "30days";

export const DATE_RANGE_OPTIONS: {
  key: DateRangeKey;
  label: string;
}[] = [
  { key: "today", label: "Last 24 hours" },
  { key: "week", label: "This week (Sun–Sat)" },
  { key: "last-week", label: "Last week (Sun–Sat)" },
  { key: "last-month", label: "Last month" },
  { key: "30days", label: "Last 30 days" },
  { key: "all", label: "All time" },
];

const TIMEZONE = "Europe/London";

type YmdParts = {
  year: number;
  month: number;
  day: number;
};

function getZonedParts(date: Date): YmdParts & { weekday: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday ?? "Mon",
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

function daysSinceSunday(weekday: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function getSundayWeekStart(parts: YmdParts & { weekday: string }): YmdParts {
  return addDays(parts, -daysSinceSunday(parts.weekday));
}

/** Calendar week Sun–Sat (UK time). */
function sundayWeekWindow(anchor: YmdParts & { weekday: string }, weeksAgo: number) {
  const sunday = addDays(getSundayWeekStart(anchor), -weeksAgo * 7);
  const saturday = addDays(sunday, 6);
  return { startYmd: toYmd(sunday), endYmd: toYmd(saturday) };
}

/** Previous calendar month (UK time), e.g. May 1–31 when today is in June. */
function previousCalendarMonth(anchor: YmdParts): {
  startYmd: string;
  endYmd: string;
} {
  let year = anchor.year;
  let month = anchor.month - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startYmd: toYmd({ year, month, day: 1 }),
    endYmd: toYmd({ year, month, day: lastDay }),
  };
}

export function parseDateRange(value: string | undefined): DateRangeKey {
  if (value && DATE_RANGE_OPTIONS.some((option) => option.key === value)) {
    return value as DateRangeKey;
  }
  return "30days";
}

export function getDateRangeLabel(range: DateRangeKey): string {
  return DATE_RANGE_OPTIONS.find((option) => option.key === range)?.label ?? "Last 30 days";
}

/** Label for on-time delivery stats (filtered by delivery date, not order date). */
export function getDeliveryDateRangeLabel(range: DateRangeKey): string {
  switch (range) {
    case "today":
      return "Delivered in last 24 hours";
    case "week":
      return "Delivered this week (Sun–Sat)";
    case "last-week":
      return "Delivered last week (Sun–Sat)";
    case "last-month":
      return "Delivered last month";
    case "30days":
      return "Delivered in last 30 days";
    case "all":
      return "All deliveries";
    default:
      return getDateRangeLabel(range);
  }
}

export function getDateRangeBounds(range: DateRangeKey): {
  startYmd: string | null;
  endYmd: string | null;
} {
  if (range === "all") {
    return { startYmd: null, endYmd: null };
  }

  const now = new Date();
  const today = getZonedParts(now);
  const todayYmd = toYmd(today);

  switch (range) {
    case "today": {
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return {
        startYmd: toYmd(getZonedParts(twentyFourHoursAgo)),
        endYmd: todayYmd,
      };
    }
    case "week":
      return sundayWeekWindow(today, 0);
    case "last-week":
      return sundayWeekWindow(today, 1);
    case "last-month":
      return previousCalendarMonth(today);
    case "30days": {
      const start = addDays(today, -29);
      return { startYmd: toYmd(start), endYmd: todayYmd };
    }
    default:
      return { startYmd: null, endYmd: null };
  }
}

export function isOrderInDateRange(
  order: Pick<StoredOrder, "createdAt">,
  range: DateRangeKey,
): boolean {
  if (range === "today") {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return new Date(order.createdAt).getTime() >= cutoff;
  }

  const { startYmd, endYmd } = getDateRangeBounds(range);
  if (!startYmd || !endYmd) {
    return true;
  }

  const orderYmd = ymdFromIso(order.createdAt);
  return orderYmd >= startYmd && orderYmd <= endYmd;
}

export function isOrderDeliveredInDateRange(
  order: Pick<StoredOrder, "deliveredAt">,
  range: DateRangeKey,
): boolean {
  if (range === "all") {
    return true;
  }

  if (!order.deliveredAt) {
    return false;
  }

  if (range === "today") {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return new Date(order.deliveredAt).getTime() >= cutoff;
  }

  const { startYmd, endYmd } = getDateRangeBounds(range);
  if (!startYmd || !endYmd) {
    return false;
  }

  const deliveredYmd = ymdFromIso(order.deliveredAt);
  return deliveredYmd >= startYmd && deliveredYmd <= endYmd;
}

export function filterOrdersByDeliveryDateRange(
  orders: StoredOrder[],
  range: DateRangeKey,
): StoredOrder[] {
  if (range === "all") {
    return orders;
  }
  return orders.filter((order) => isOrderDeliveredInDateRange(order, range));
}

export function filterOrdersByDateRange(
  orders: StoredOrder[],
  range: DateRangeKey,
): StoredOrder[] {
  if (range === "all") {
    return orders;
  }
  return orders.filter((order) => isOrderInDateRange(order, range));
}

/** Date bounds for cost proration (all time uses first order → today). */
export function resolveDateRangeBounds(
  range: DateRangeKey,
  orders: StoredOrder[],
): { startYmd: string; endYmd: string } | null {
  const bounds = getDateRangeBounds(range);
  if (bounds.startYmd && bounds.endYmd) {
    return { startYmd: bounds.startYmd, endYmd: bounds.endYmd };
  }

  if (range !== "all" || !orders.length) {
    return null;
  }

  const orderDates = orders
    .map((order) => ymdFromIso(order.createdAt))
    .sort((a, b) => a.localeCompare(b));

  return {
    startYmd: orderDates[0]!,
    endYmd: toYmd(getZonedParts(new Date())),
  };
}
