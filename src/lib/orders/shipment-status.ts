import type { ShopifyFulfillment } from "@/lib/shopify/types";

/** Shopify fulfillment shipment_status values. */
export type ShopifyShipmentStatus =
  | "label_printed"
  | "confirmed"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "attempted_delivery"
  | "failure"
  | "ready_for_pickup";

const STATUS_PRIORITY: Record<string, number> = {
  delivered: 100,
  out_for_delivery: 90,
  in_transit: 80,
  ready_for_pickup: 70,
  attempted_delivery: 60,
  confirmed: 50,
  label_printed: 40,
  failure: 10,
};

export function shipmentStatusFromFulfillments(
  fulfillments: Pick<ShopifyFulfillment, "shipment_status">[],
): string | null {
  let best: string | null = null;
  let bestPriority = -1;

  for (const fulfillment of fulfillments) {
    const status = fulfillment.shipment_status?.trim();
    if (!status) {
      continue;
    }

    const priority = STATUS_PRIORITY[status] ?? 0;
    if (priority > bestPriority) {
      best = status;
      bestPriority = priority;
    }
  }

  return best;
}

export function formatShipmentStatus(status: string | null | undefined): string {
  if (!status?.trim()) {
    return "Unknown";
  }

  return status
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shipmentStatusBadgeClass(
  status: string | null | undefined,
): string {
  switch (status) {
    case "delivered":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
    case "in_transit":
    case "out_for_delivery":
      return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300";
    case "ready_for_pickup":
    case "confirmed":
    case "label_printed":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300";
    case "attempted_delivery":
      return "border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-300";
    case "failure":
      return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}
