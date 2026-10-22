import { getSalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";
import { TemuApiError } from "@/lib/temu/client";
import { fetchTemuShipmentTracking } from "@/lib/temu/shipment-tracking";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";
import {
  parseTemuOrderIdFromTags,
} from "@/lib/shopify/temu-note-attributes";

export type TemuTrackingEnrichOptions = {
  recentDays?: number;
  maxLookups?: number;
  onlyMissing?: boolean;
};

export type TemuTrackingEnrichResult = {
  orders: StoredOrder[];
  trackingApplied: number;
  lookups: number;
  skipped: boolean;
  skipReason?: string;
};

const DEFAULT_RECENT_DAYS = 60;
const DEFAULT_MAX_LOOKUPS = 25;
const LOOKUP_DELAY_MS = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecentOrder(order: StoredOrder, recentDays: number): boolean {
  const created = Date.parse(order.createdAt);
  if (!Number.isFinite(created)) return true;
  return created >= Date.now() - recentDays * 24 * 60 * 60 * 1000;
}

function needsTracking(order: StoredOrder): boolean {
  return !order.trackingNumbers?.length;
}

function resolveTemuOrderId(order: StoredOrder): string | null {
  return order.temuOrderId?.trim() || parseTemuOrderIdFromTags(order.tags);
}

function mergeTracking(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming].map((n) => n.trim()).filter(Boolean))];
}

/**
 * Fill missing tracking numbers on Temu channel orders from
 * bg.logistics.shipment.v2.get (via order detail for child orderSns).
 */
export async function enrichOrdersWithTemuTracking(
  orders: StoredOrder[],
  options: TemuTrackingEnrichOptions = {},
): Promise<TemuTrackingEnrichResult> {
  const recentDays = options.recentDays ?? DEFAULT_RECENT_DAYS;
  const maxLookups = options.maxLookups ?? DEFAULT_MAX_LOOKUPS;
  const onlyMissing = options.onlyMissing ?? true;

  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return {
      orders,
      trackingApplied: 0,
      lookups: 0,
      skipped: true,
      skipReason: "Temu is not connected.",
    };
  }

  const candidates = orders.filter((order) => {
    if (getSalesChannel(order.tags) !== "Temu") return false;
    if (!isRecentOrder(order, recentDays)) return false;
    if (onlyMissing && !needsTracking(order)) return false;
    return Boolean(resolveTemuOrderId(order));
  });

  if (candidates.length === 0) {
    return { orders, trackingApplied: 0, lookups: 0, skipped: false };
  }

  const byShopifyId = new Map(orders.map((order) => [order.shopifyId, order]));
  let trackingApplied = 0;
  let lookups = 0;

  for (const candidate of candidates) {
    if (lookups >= maxLookups) break;
    const parentOrderSn = resolveTemuOrderId(candidate);
    if (!parentOrderSn) continue;

    lookups += 1;
    try {
      const shipment = await fetchTemuShipmentTracking(credentials, parentOrderSn);
      if (shipment.trackingNumbers.length === 0) {
        if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
        continue;
      }

      const current = byShopifyId.get(candidate.shopifyId);
      if (!current) continue;
      const nextNumbers = onlyMissing
        ? mergeTracking(current.trackingNumbers ?? [], shipment.trackingNumbers)
        : mergeTracking([], shipment.trackingNumbers);
      const changed =
        nextNumbers.join("|") !== (current.trackingNumbers ?? []).join("|") ||
        (shipment.carrier && shipment.carrier !== current.shippingCarrier);
      if (!changed) {
        if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
        continue;
      }

      byShopifyId.set(candidate.shopifyId, {
        ...current,
        trackingNumbers: nextNumbers,
        shippingCarrier: shipment.carrier || current.shippingCarrier,
        temuOrderId: current.temuOrderId || parentOrderSn,
      });
      trackingApplied += 1;
    } catch (error) {
      if (!(error instanceof TemuApiError)) {
        console.error("[temu-tracking] lookup failed:", error);
      }
    }
    if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
  }

  return {
    orders: orders.map((order) => byShopifyId.get(order.shopifyId) ?? order),
    trackingApplied,
    lookups,
    skipped: false,
  };
}
