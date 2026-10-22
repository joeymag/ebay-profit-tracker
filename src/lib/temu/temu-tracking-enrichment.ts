import { getSalesChannel } from "@/lib/orders/channel";
import { withComputedFinancials } from "@/lib/orders/financials";
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
  labelCostApplied: number;
  lookups: number;
  skipped: boolean;
  skipReason?: string;
};

export type SyncTemuTrackingResult = {
  ok: true;
  days: number;
  candidates: number;
  trackingUpdated: number;
  labelCostUpdated: number;
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

function needsLabelCost(shippingLabelCost: number | null | undefined): boolean {
  return shippingLabelCost == null;
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

function recomputeFinancials(
  order: Pick<
    StoredOrder,
    | "revenue"
    | "productCost"
    | "shippingLabelCost"
    | "tags"
    | "ebayFeeRate"
    | "ebayAdsFeeRate"
    | "ebayFeesActual"
    | "ebayAdsFeeActual"
  >,
): Pick<StoredOrder, "platformFee" | "cost" | "profit"> {
  return withComputedFinancials({
    ...(order as StoredOrder),
  });
}

/**
 * Fill missing tracking / Temu buy-shipping label cost on Temu channel orders.
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
      labelCostApplied: 0,
      lookups: 0,
      skipped: true,
      skipReason: "Temu is not connected.",
    };
  }

  const candidates = orders
    .filter((order) => {
      if (getSalesChannel(order.tags) !== "Temu") return false;
      if (!isRecentOrder(order, recentDays)) return false;
      if (!resolveTemuOrderId(order)) return false;
      if (!onlyMissing) return true;
      return (
        needsTracking(order.trackingNumbers) || needsLabelCost(order.shippingLabelCost)
      );
    })
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  if (candidates.length === 0) {
    return {
      orders,
      trackingApplied: 0,
      labelCostApplied: 0,
      lookups: 0,
      skipped: false,
    };
  }

  const byShopifyId = new Map(orders.map((order) => [order.shopifyId, order]));
  let trackingApplied = 0;
  let labelCostApplied = 0;
  let lookups = 0;

  for (const candidate of candidates) {
    if (lookups >= maxLookups) break;
    const parentOrderSn = resolveTemuOrderId(candidate);
    if (!parentOrderSn) continue;

    lookups += 1;
    try {
      const shipment = await fetchTemuShipmentTracking(credentials, parentOrderSn);
      const current = byShopifyId.get(candidate.shopifyId);
      if (!current) continue;

      const nextNumbers =
        shipment.trackingNumbers.length > 0
          ? onlyMissing
            ? mergeTracking(current.trackingNumbers ?? [], shipment.trackingNumbers)
            : mergeTracking([], shipment.trackingNumbers)
          : (current.trackingNumbers ?? []);
      const nextLabelCost =
        shipment.labelCost != null &&
        (current.shippingLabelCost == null || !onlyMissing)
          ? shipment.labelCost
          : current.shippingLabelCost;

      const trackingChanged =
        nextNumbers.join("|") !== (current.trackingNumbers ?? []).join("|");
      const carrierChanged = Boolean(
        shipment.carrier && shipment.carrier !== current.shippingCarrier,
      );
      const labelChanged = nextLabelCost !== current.shippingLabelCost;

      if (!trackingChanged && !carrierChanged && !labelChanged) {
        if (!current.temuOrderId && parentOrderSn) {
          byShopifyId.set(candidate.shopifyId, {
            ...current,
            temuOrderId: parentOrderSn,
          });
        }
        if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
        continue;
      }

      const patched: StoredOrder = {
        ...current,
        trackingNumbers: nextNumbers,
        shippingCarrier: shipment.carrier || current.shippingCarrier,
        shippingLabelCost: nextLabelCost,
        temuOrderId: current.temuOrderId || parentOrderSn,
      };
      const financials = recomputeFinancials(patched);
      byShopifyId.set(candidate.shopifyId, { ...patched, ...financials });
      if (trackingChanged) trackingApplied += 1;
      if (labelChanged && nextLabelCost != null) labelCostApplied += 1;
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
    labelCostApplied,
    lookups,
    skipped: false,
  };
}

/**
 * Backfill Temu tracking + buy-shipping label cost onto stored orders.
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
      labelCostUpdated: 0,
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
      labelCostUpdated: 0,
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
    .select(
      "shopify_id, created_at, tags, temu_order_id, tracking_numbers, shipping_carrier, shipping_label_cost, product_cost, revenue, ebay_fee_rate, ebay_ads_fee_rate, ebay_fees_actual, ebay_ads_fee_actual",
    )
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
      labelCostUpdated: 0,
      lookups: 0,
      skipped: true,
      skipReason: error?.message || "Could not load Temu orders.",
      syncedAt,
    };
  }

  const candidates = data.filter((row) => {
    if (!resolveTemuOrderId({ temuOrderId: row.temu_order_id, tags: row.tags })) {
      return false;
    }
    return (
      needsTracking(row.tracking_numbers) ||
      needsLabelCost(
        row.shipping_label_cost == null ? null : Number(row.shipping_label_cost),
      )
    );
  });

  let trackingUpdated = 0;
  let labelCostUpdated = 0;
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
      const nextNumbers =
        shipment.trackingNumbers.length > 0
          ? mergeTracking(row.tracking_numbers ?? [], shipment.trackingNumbers)
          : (row.tracking_numbers ?? []);
      const nextLabelCost =
        shipment.labelCost != null && row.shipping_label_cost == null
          ? shipment.labelCost
          : row.shipping_label_cost == null
            ? null
            : Number(row.shipping_label_cost);

      const trackingChanged =
        nextNumbers.join("|") !== (row.tracking_numbers ?? []).join("|");
      const labelChanged =
        shipment.labelCost != null && row.shipping_label_cost == null;

      if (!trackingChanged && !labelChanged && !shipment.carrier) {
        if (!row.temu_order_id) {
          await supabase
            .from("orders")
            .update({ temu_order_id: parentOrderSn })
            .eq("shopify_id", row.shopify_id);
        }
        if (lookups < maxLookups) await sleep(LOOKUP_DELAY_MS);
        continue;
      }

      const financials = recomputeFinancials({
        revenue: Number(row.revenue),
        productCost:
          row.product_cost == null ? null : Number(row.product_cost),
        shippingLabelCost: nextLabelCost,
        tags: row.tags,
        ebayFeeRate:
          row.ebay_fee_rate == null ? null : Number(row.ebay_fee_rate),
        ebayAdsFeeRate:
          row.ebay_ads_fee_rate == null ? null : Number(row.ebay_ads_fee_rate),
        ebayFeesActual:
          row.ebay_fees_actual == null ? null : Number(row.ebay_fees_actual),
        ebayAdsFeeActual:
          row.ebay_ads_fee_actual == null
            ? null
            : Number(row.ebay_ads_fee_actual),
      });

      await supabase
        .from("orders")
        .update({
          temu_order_id: row.temu_order_id || parentOrderSn,
          tracking_numbers: nextNumbers,
          shipping_carrier: shipment.carrier || row.shipping_carrier,
          ...(labelChanged ? { shipping_label_cost: nextLabelCost } : {}),
          cost: financials.cost,
          profit: financials.profit,
        })
        .eq("shopify_id", row.shopify_id);

      if (trackingChanged) trackingUpdated += 1;
      if (labelChanged) labelCostUpdated += 1;
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
    labelCostUpdated,
    lookups,
    skipped: false,
    syncedAt,
  };
}
