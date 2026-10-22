import { getSalesChannel } from "@/lib/orders/channel";
import type { StoredOrder } from "@/lib/orders/types";
import { TemuApiError } from "@/lib/temu/client";
import { fetchTemuShipmentTracking } from "@/lib/temu/shipment-tracking";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";
import { parseTemuOrderIdFromTags } from "@/lib/shopify/temu-note-attributes";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

export type SyncTemuTrackingResult = {
  ok: true;
  days: number;
  candidates: number;
  trackingUpdated: number;
  lookups: number;
  skipped: boolean;
  skipReason?: string;
  syncedAt: string;
};

const DEFAULT_RECENT_DAYS = 60;
const DEFAULT_MAX_LOOKUPS = 40;
const LOOKUP_DELAY_MS = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecentOrder(order: { createdAt: string }, recentDays: number): boolean {
  const created = Date.parse(order.createdAt);
  if (!Number.isFinite(created)) return true;
  return created >= Date.now() - recentDays * 24 * 60 * 60 * 1000;
}

function needsTracking(trackingNumbers: string[] | null | undefined): boolean {
  return !(trackingNumbers?.length);
}

function resolveTemuOrderId(order: {
  temuOrderId?: string | null;
  tags?: string | null;
}): string | null {
  return order.temuOrderId?.trim() || parseTemuOrderIdFromTags(order.tags);
}

function mergeTracking(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming].map((n) => n.trim()).filter(Boolean))];
}

/**
 * Fill missing tracking numbers on Temu channel orders from
 * bg.logistics.shipment.v2.get (via order detail for child orderSns).
 * Oldest missing orders are tried first so past orders are not starved by the lookup cap.
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

  const candidates = orders
    .filter((order) => {
      if (getSalesChannel(order.tags) !== "Temu") return false;
      if (!isRecentOrder(order, recentDays)) return false;
      if (onlyMissing && !needsTracking(order.trackingNumbers)) return false;
      return Boolean(resolveTemuOrderId(order));
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

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

/**
 * Backfill Temu tracking onto stored orders (including ones not in the current Shopify sync batch).
 */
export async function syncTemuTrackingFromDatabase(options?: {
  days?: number;
  maxLookups?: number;
}): Promise<SyncTemuTrackingResult> {
  const syncedAt = new Date().toISOString();
  const days = Math.min(Math.max(options?.days ?? 60, 1), 180);
  const maxLookups = options?.maxLookups ?? DEFAULT_MAX_LOOKUPS;

  if (!isSupabaseConfigured()) {
    return {
      ok: true,
      days,
      candidates: 0,
      trackingUpdated: 0,
      lookups: 0,
      skipped: true,
      skipReason: "Supabase is not configured.",
      syncedAt,
    };
  }

  const credentials = await getStoredTemuCredentials();
  if (!credentials) {
    return {
      ok: true,
      days,
      candidates: 0,
      trackingUpdated: 0,
      lookups: 0,
      skipped: true,
      skipReason: "Temu is not connected.",
      syncedAt,
    };
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("shopify_id, created_at, tags, temu_order_id, tracking_numbers, shipping_carrier")
    .gte("created_at", since)
    .ilike("tags", "%temu%")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error || !data) {
    return {
      ok: true,
      days,
      candidates: 0,
      trackingUpdated: 0,
      lookups: 0,
      skipped: true,
      skipReason: error?.message || "Could not load Temu orders.",
      syncedAt,
    };
  }

  const candidates = data.filter((row) => {
    if (!needsTracking(row.tracking_numbers)) return false;
    return Boolean(resolveTemuOrderId({ temuOrderId: row.temu_order_id, tags: row.tags }));
  });

  let trackingUpdated = 0;
  let lookups = 0;

  for (const row of candidates) {
    if (lookups >= maxLookups) break;
    const parentOrderSn = resolveTemuOrderId({
      temuOrderId: row.temu_order_id,
      tags: row.tags,
    });
    if (!parentOrderSn) continue;

    lookups += 1;
    try {
      const shipment = await fetchTemuShipmentTracking(credentials, parentOrderSn);
      if (shipment.trackingNumbers.length === 0) {
        // Still persist temu_order_id when we can resolve it from tags.
        if (!row.temu_order_id) {
          await supabase
            .from("orders")
            .update({ temu_order_id: parentOrderSn })
            .eq("shopify_id", row.shopify_id);
        }
        if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
        continue;
      }

      const nextNumbers = mergeTracking(row.tracking_numbers ?? [], shipment.trackingNumbers);
      await supabase
        .from("orders")
        .update({
          temu_order_id: row.temu_order_id || parentOrderSn,
          tracking_numbers: nextNumbers,
          shipping_carrier: shipment.carrier || row.shipping_carrier,
        })
        .eq("shopify_id", row.shopify_id);
      trackingUpdated += 1;
    } catch (err) {
      if (!(err instanceof TemuApiError)) {
        console.error("[temu-tracking] database sync failed:", err);
      }
    }
    if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
  }

  return {
    ok: true,
    days,
    candidates: candidates.length,
    trackingUpdated,
    lookups,
    skipped: false,
    syncedAt,
  };
}
