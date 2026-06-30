import { getSalesChannel } from "@/lib/orders/channel";
import { getDeliverByTiming } from "@/lib/orders/deliver-by-timing";
import type { StoredOrder } from "@/lib/orders/types";

/** eBay orders delivered within this many calendar days count as on time. */
export const EBAY_ON_TIME_DELIVERY_DAYS = 5;

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

function toUtcMs({ year, month, day }: YmdParts): number {
  return Date.UTC(year, month - 1, day, 12);
}

/** Whole calendar days from order date to delivery date (UK time). */
export function calendarDaysBetween(isoStart: string, isoEnd: string): number {
  const start = toUtcMs(getZonedParts(new Date(isoStart)));
  const end = toUtcMs(getZonedParts(new Date(isoEnd)));
  return Math.round((end - start) / 86_400_000);
}

export function ymdFromIso(iso: string): string {
  const parts = getZonedParts(new Date(iso));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function isSameOrBeforeCalendarDay(
  isoDate: string,
  isoDeadline: string,
): boolean {
  return ymdFromIso(isoDate) <= ymdFromIso(isoDeadline);
}

export type EbayDeliveryTiming = {
  deliverByAt: string | null;
  deliveredAt: string | null;
  daysToDeliver: number | null;
  daysLate: number | null;
  /** null = not delivered yet or missing delivery date */
  onTime: boolean | null;
  overdue: boolean;
  /** Uses eBay promised deliver-by date instead of the 5-day fallback */
  usesDeliverByDate: boolean;
};

export function getEbayDeliveryTiming(
  order: Pick<
    StoredOrder,
    | "tags"
    | "createdAt"
    | "shipmentStatus"
    | "deliveredAt"
    | "ebayDeliverByAt"
  >,
): EbayDeliveryTiming {
  const empty: EbayDeliveryTiming = {
    deliverByAt: null,
    deliveredAt: null,
    daysToDeliver: null,
    daysLate: null,
    onTime: null,
    overdue: false,
    usesDeliverByDate: false,
  };

  if (getSalesChannel(order.tags) !== "eBay") {
    return empty;
  }

  if (order.ebayDeliverByAt) {
    const byDate = getDeliverByTiming({
      deliverByAt: order.ebayDeliverByAt,
      deliveredAt: order.deliveredAt,
      shipmentStatus: order.shipmentStatus,
    });

    const daysToDeliver =
      order.deliveredAt != null
        ? calendarDaysBetween(order.createdAt, order.deliveredAt)
        : null;

    return {
      deliverByAt: byDate.deliverByAt,
      deliveredAt: byDate.deliveredAt,
      daysToDeliver,
      daysLate: byDate.daysLate,
      onTime: byDate.onTime,
      overdue: byDate.overdue,
      usesDeliverByDate: true,
    };
  }

  const deliveredAt = order.deliveredAt ?? null;

  if (order.shipmentStatus !== "delivered" || !deliveredAt) {
    return {
      ...empty,
      deliveredAt,
    };
  }

  const daysToDeliver = calendarDaysBetween(order.createdAt, deliveredAt);

  return {
    deliverByAt: null,
    deliveredAt,
    daysToDeliver,
    daysLate: null,
    onTime: daysToDeliver <= EBAY_ON_TIME_DELIVERY_DAYS,
    overdue: false,
    usesDeliverByDate: false,
  };
}

export type EbayOnTimeDeliveryStats = {
  ebayOrders: number;
  deliveredCount: number;
  onTimeCount: number;
  lateCount: number;
  pendingCount: number;
  /** Delivered in Shopify but no delivery timestamp stored yet. */
  missingDeliveryDateCount: number;
  onTimeRate: number | null;
};

export function aggregateEbayOnTimeDelivery(
  orders: Pick<
    StoredOrder,
    | "tags"
    | "createdAt"
    | "shipmentStatus"
    | "deliveredAt"
    | "ebayDeliverByAt"
  >[],
): EbayOnTimeDeliveryStats {
  let ebayOrders = 0;
  let deliveredCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let pendingCount = 0;
  let missingDeliveryDateCount = 0;

  for (const order of orders) {
    if (getSalesChannel(order.tags) !== "eBay") {
      continue;
    }

    ebayOrders += 1;

    if (
      order.shipmentStatus === "delivered" &&
      !order.deliveredAt
    ) {
      missingDeliveryDateCount += 1;
      pendingCount += 1;
      continue;
    }

    const timing = getEbayDeliveryTiming(order);

    if (timing.onTime === true) {
      deliveredCount += 1;
      onTimeCount += 1;
    } else if (timing.onTime === false) {
      deliveredCount += 1;
      lateCount += 1;
    } else {
      pendingCount += 1;
    }
  }

  return {
    ebayOrders,
    deliveredCount,
    onTimeCount,
    lateCount,
    pendingCount,
    missingDeliveryDateCount,
    onTimeRate:
      deliveredCount > 0 ? (onTimeCount / deliveredCount) * 100 : null,
  };
}

export function formatOnTimeDeliveryLabel(onTime: boolean | null): string {
  if (onTime === true) {
    return "On time";
  }
  if (onTime === false) {
    return "Late";
  }
  return "Pending";
}

export function onTimeDeliveryBadgeClass(onTime: boolean | null): string {
  if (onTime === true) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  }
  if (onTime === false) {
    return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export type LateEbayOrder = {
  order: StoredOrder;
  timing: EbayDeliveryTiming;
  /** Calendar days over the on-time target. */
  daysOver: number;
};

export function listLateEbayOrders(orders: StoredOrder[]): LateEbayOrder[] {
  const results: LateEbayOrder[] = [];

  for (const order of orders) {
    const timing = getEbayDeliveryTiming(order);
    if (timing.onTime !== false) {
      continue;
    }

    const daysOver = timing.usesDeliverByDate
      ? (timing.daysLate ?? 0)
      : timing.daysToDeliver != null
        ? timing.daysToDeliver - EBAY_ON_TIME_DELIVERY_DAYS
        : 0;

    results.push({
      order,
      timing,
      daysOver,
    });
  }

  return results.sort(
    (a, b) =>
      new Date(b.timing.deliveredAt!).getTime() -
      new Date(a.timing.deliveredAt!).getTime(),
  );
}
