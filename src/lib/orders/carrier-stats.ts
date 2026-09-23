import type { StoredOrder } from "@/lib/orders/types";

export type CarrierBucket = "Royal Mail" | "Evri" | "Other" | "Unknown";

export type CarrierPostageStats = {
  carrier: CarrierBucket;
  parcels: number;
  spend: number;
  ordersWithCost: number;
  avgSpend: number | null;
};

const BUCKET_ORDER: CarrierBucket[] = [
  "Royal Mail",
  "Evri",
  "Other",
  "Unknown",
];

export function normalizeCarrierBucket(
  carrier: string | null | undefined,
): CarrierBucket {
  const raw = carrier?.trim();
  if (!raw) return "Unknown";
  const lower = raw.toLowerCase();
  if (lower.includes("royal mail") || lower === "rm") return "Royal Mail";
  if (lower.includes("evri") || lower.includes("hermes")) return "Evri";
  return "Other";
}

function emptyStats(carrier: CarrierBucket): CarrierPostageStats {
  return {
    carrier,
    parcels: 0,
    spend: 0,
    ordersWithCost: 0,
    avgSpend: null,
  };
}

/**
 * Count parcels and postage spend by carrier for the dashboard.
 * A parcel = order with a carrier and/or tracking number (shipped).
 */
export function aggregateCarrierPostageStats(
  orders: StoredOrder[],
): CarrierPostageStats[] {
  const byCarrier = new Map<CarrierBucket, CarrierPostageStats>();
  for (const carrier of BUCKET_ORDER) {
    byCarrier.set(carrier, emptyStats(carrier));
  }

  for (const order of orders) {
    const hasTracking = (order.trackingNumbers?.length ?? 0) > 0;
    const bucket = normalizeCarrierBucket(order.shippingCarrier);
    // Only count as a sent parcel when we have carrier or tracking.
    if (!order.shippingCarrier && !hasTracking) {
      continue;
    }

    const stats = byCarrier.get(bucket)!;
    stats.parcels += 1;
    if (order.shippingLabelCost != null && order.shippingLabelCost > 0) {
      stats.spend += order.shippingLabelCost;
      stats.ordersWithCost += 1;
    }
  }

  for (const stats of byCarrier.values()) {
    stats.avgSpend =
      stats.ordersWithCost > 0 ? stats.spend / stats.ordersWithCost : null;
  }

  return BUCKET_ORDER.map((carrier) => byCarrier.get(carrier)!).filter(
    (row) => row.parcels > 0 || row.spend > 0,
  );
}

export const carrierStyles: Record<
  CarrierBucket,
  { badge: string; bar: string }
> = {
  "Royal Mail": {
    badge:
      "border-red-500/30 bg-red-500/10 font-semibold text-red-800 dark:text-red-300",
    bar: "bg-red-500",
  },
  Evri: {
    badge:
      "border-violet-500/30 bg-violet-500/10 font-semibold text-violet-800 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  Other: {
    badge: "border-border bg-muted font-medium text-muted-foreground",
    bar: "bg-muted-foreground",
  },
  Unknown: {
    badge: "border-border bg-muted/60 font-medium text-muted-foreground",
    bar: "bg-muted-foreground/60",
  },
};
