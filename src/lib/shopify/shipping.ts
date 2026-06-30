import type { ShopifyFulfillment, ShopifyOrder, ShopifyShippingLine } from "@/lib/shopify/types";
import { shipmentStatusFromFulfillments } from "@/lib/orders/shipment-status";

const KNOWN_CARRIERS = [
  "Royal Mail",
  "Parcelforce",
  "DPD",
  "Evri",
  "Hermes",
  "Yodel",
  "UPS",
  "FedEx",
  "DHL",
  "Amazon",
] as const;

export type ParsedShipping = {
  /** Actual carrier used to ship (from Shopify fulfillment). */
  shippingCarrier: string | null;
  /** eBay / buyer-selected service from shipping_lines. */
  shippingService: string | null;
  trackingNumbers: string[];
  trackingUrl: string | null;
  shipmentStatus: string | null;
  deliveredAt: string | null;
};

function normalizeCarrierName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === "hermes") {
    return "Evri";
  }
  return trimmed;
}

function carrierFromTitle(title: string): string | null {
  for (const carrier of KNOWN_CARRIERS) {
    if (title.toLowerCase().includes(carrier.toLowerCase())) {
      return carrier === "Hermes" ? "Evri" : carrier;
    }
  }
  return null;
}

function serviceFromLines(lines: ShopifyShippingLine[]): string | null {
  const titles = lines
    .filter((line) => !line.is_removed)
    .map((line) => line.title?.trim())
    .filter(Boolean) as string[];

  return titles.length ? titles.join(", ") : null;
}

function latestTimestamp(values: string[]): string | null {
  const sorted = values.filter(Boolean).sort((a, b) => a.localeCompare(b));
  return sorted.at(-1) ?? null;
}

/** Best-effort delivery timestamp from fulfillment fields (no events API). */
export function deliveredAtFromFulfillments(
  fulfillments: ShopifyFulfillment[],
): string | null {
  const timestamps: string[] = [];

  for (const fulfillment of fulfillments) {
    if (fulfillment.shipment_status?.trim().toLowerCase() !== "delivered") {
      continue;
    }

    const updatedAt = fulfillment.updated_at?.trim();
    if (updatedAt) {
      timestamps.push(updatedAt);
    }
  }

  return latestTimestamp(timestamps);
}

function trackingFromFulfillments(fulfillments: ShopifyFulfillment[]): {
  trackingNumbers: string[];
  trackingUrl: string | null;
} {
  const numbers = new Set<string>();

  for (const f of fulfillments) {
    if (f.tracking_number?.trim()) {
      numbers.add(f.tracking_number.trim());
    }
    for (const n of f.tracking_numbers ?? []) {
      if (n?.trim()) {
        numbers.add(n.trim());
      }
    }
  }

  const trackingUrl =
    fulfillments.find((f) => f.tracking_url?.trim())?.tracking_url?.trim() ??
    fulfillments.find((f) => f.tracking_urls?.[0]?.trim())?.tracking_urls?.[0]
      ?.trim() ??
    null;

  return {
    trackingNumbers: [...numbers],
    trackingUrl,
  };
}

function carrierFromFulfillments(
  fulfillments: ShopifyFulfillment[],
): string | null {
  for (const f of fulfillments) {
    const company = f.tracking_company?.trim();
    if (company) {
      return normalizeCarrierName(company);
    }
  }
  return null;
}

/** eBay / shipping_lines only — used when no fulfillment exists yet. */
export function parseOrderShippingFromLines(
  order: Pick<ShopifyOrder, "shipping_lines">,
): Pick<ParsedShipping, "shippingCarrier" | "shippingService"> {
  const lines = order.shipping_lines ?? [];
  const shippingService = serviceFromLines(lines);

  let shippingCarrier: string | null = null;
  if (shippingService) {
    shippingCarrier = carrierFromTitle(shippingService);
  }
  if (!shippingCarrier && lines[0]?.carrier_identifier?.trim()) {
    shippingCarrier = normalizeCarrierName(lines[0].carrier_identifier);
  }

  return { shippingCarrier, shippingService };
}

/** Actual shipment data from Shopify fulfillments (label carrier + tracking). */
export function parseShippingFromFulfillments(
  fulfillments: ShopifyFulfillment[],
  orderedService: string | null,
): ParsedShipping {
  const { trackingNumbers, trackingUrl } = trackingFromFulfillments(fulfillments);
  const fulfillmentCarrier = carrierFromFulfillments(fulfillments);
  const shipmentStatus = shipmentStatusFromFulfillments(fulfillments);

  let shippingCarrier = fulfillmentCarrier;
  if (!shippingCarrier && orderedService) {
    shippingCarrier = carrierFromTitle(orderedService);
  }

  return {
    shippingCarrier,
    shippingService: orderedService,
    trackingNumbers,
    trackingUrl,
    shipmentStatus,
    deliveredAt: deliveredAtFromFulfillments(fulfillments),
  };
}

export function parseOrderShipping(order: ShopifyOrder): ParsedShipping {
  const lines = parseOrderShippingFromLines(order);
  const fulfillments = order.fulfillments ?? [];

  if (fulfillments.length) {
    return parseShippingFromFulfillments(fulfillments, lines.shippingService);
  }

  return {
    ...lines,
    trackingNumbers: [],
    trackingUrl: null,
    shipmentStatus: null,
    deliveredAt: null,
  };
}

export function enrichStoredOrderWithFulfillments<
  T extends {
    shippingService: string | null;
    shippingCarrier: string | null;
    trackingNumbers?: string[];
    trackingUrl?: string | null;
    shipmentStatus?: string | null;
    deliveredAt?: string | null;
  },
>(order: T, fulfillments: ShopifyFulfillment[], deliveredAt?: string | null): T {
  if (!fulfillments.length) {
    return order;
  }

  const parsed = parseShippingFromFulfillments(
    fulfillments,
    order.shippingService,
  );

  return {
    ...order,
    shippingCarrier: parsed.shippingCarrier,
    shippingService: parsed.shippingService,
    trackingNumbers: parsed.trackingNumbers,
    trackingUrl: parsed.trackingUrl,
    shipmentStatus: parsed.shipmentStatus,
    deliveredAt: deliveredAt ?? order.deliveredAt ?? parsed.deliveredAt ?? null,
  };
}
