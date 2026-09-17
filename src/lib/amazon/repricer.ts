import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  getCompetitiveSnapshot,
  resolveAmazonSellerId,
  type AmazonCompetitiveSnapshot,
} from "@/lib/amazon/pricing";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type RepriceStrategy =
  | "manual"
  | "match_buybox"
  | "match_lowest"
  | "undercut_lowest"
  | "undercut_buybox";

export type AmazonRepriceRule = {
  sku: string;
  enabled: boolean;
  strategy: RepriceStrategy;
  minPrice: number | null;
  maxPrice: number | null;
  undercutAmount: number;
  updatedAt: string;
};

export type RepriceSuggestion = {
  sku: string;
  currentPrice: number | null;
  suggestedPrice: number | null;
  reason: string;
  competitive: AmazonCompetitiveSnapshot | null;
  rule: AmazonRepriceRule | null;
};

export type AmazonRepriceEvent = {
  id: number;
  sku: string;
  fromPrice: number | null;
  toPrice: number;
  source: string;
  reason: string | null;
  status: string;
  createdAt: string;
};

const DEFAULT_UNDERCUT = 0.01;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPrice(
  value: number,
  minPrice: number | null,
  maxPrice: number | null,
): number {
  let next = value;
  if (minPrice != null) next = Math.max(next, minPrice);
  if (maxPrice != null) next = Math.min(next, maxPrice);
  return roundMoney(next);
}

export function computeSuggestedPrice(input: {
  currentPrice: number | null;
  competitive: AmazonCompetitiveSnapshot | null;
  rule: AmazonRepriceRule | null;
}): { suggestedPrice: number | null; reason: string } {
  const rule = input.rule;
  if (!rule || !rule.enabled) {
    return { suggestedPrice: null, reason: "No active reprice rule." };
  }
  if (rule.strategy === "manual") {
    return { suggestedPrice: null, reason: "Manual strategy — set price yourself." };
  }

  const competitive = input.competitive;
  if (!competitive) {
    return { suggestedPrice: null, reason: "No competitive data." };
  }

  const undercut = rule.undercutAmount > 0 ? rule.undercutAmount : DEFAULT_UNDERCUT;
  let target: number | null = null;
  let reason = "";

  if (rule.strategy === "undercut_buybox") {
    if (competitive.youHaveBuyBox) {
      return {
        suggestedPrice: null,
        reason: "You already hold the Buy Box.",
      };
    }
    if (competitive.buyBoxPrice == null) {
      return { suggestedPrice: null, reason: "No Buy Box price to beat." };
    }
    target = competitive.buyBoxPrice - undercut;
    reason = `Beat Buy Box (£${competitive.buyBoxPrice.toFixed(2)}) by £${undercut.toFixed(2)}`;
  } else if (rule.strategy === "match_buybox") {
    target = competitive.buyBoxPrice;
    reason = target != null ? `Match Buy Box (£${target.toFixed(2)})` : "No Buy Box price.";
  } else if (rule.strategy === "match_lowest") {
    target = competitive.lowestPrice;
    reason =
      target != null ? `Match lowest offer (£${target.toFixed(2)})` : "No lowest offer.";
  } else {
    // undercut_lowest
    if (competitive.lowestPrice == null) {
      return { suggestedPrice: null, reason: "No lowest offer to undercut." };
    }
    if (competitive.youHaveBuyBox && competitive.yourOfferPrice != null) {
      const lowestOther =
        competitive.lowestPrice < competitive.yourOfferPrice - 0.001
          ? competitive.lowestPrice
          : null;
      if (lowestOther == null) {
        return {
          suggestedPrice: null,
          reason: "You already hold Buy Box at the lowest price.",
        };
      }
      target = lowestOther - undercut;
      reason = `Undercut next offer (£${lowestOther.toFixed(2)}) by £${undercut.toFixed(2)}`;
    } else {
      target = competitive.lowestPrice - undercut;
      reason = `Undercut lowest (£${competitive.lowestPrice.toFixed(2)}) by £${undercut.toFixed(2)}`;
    }
  }

  if (target == null) {
    return { suggestedPrice: null, reason };
  }

  const suggested = clampPrice(target, rule.minPrice, rule.maxPrice);
  if (rule.minPrice != null && target < rule.minPrice) {
    reason += ` · floored at min £${rule.minPrice.toFixed(2)}`;
  }
  if (rule.maxPrice != null && target > rule.maxPrice) {
    reason += ` · capped at max £${rule.maxPrice.toFixed(2)}`;
  }

  if (
    input.currentPrice != null &&
    Math.abs(suggested - input.currentPrice) < 0.005
  ) {
    return { suggestedPrice: null, reason: "Already at suggested price." };
  }

  return { suggestedPrice: suggested, reason };
}

export async function listRepriceRules(): Promise<AmazonRepriceRule[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("amazon_reprice_rules")
      .select("*")
      .order("sku");
    if (error || !data) return [];
    return data.map((row) => ({
      sku: row.sku,
      enabled: row.enabled,
      strategy: row.strategy as RepriceStrategy,
      minPrice: row.min_price == null ? null : Number(row.min_price),
      maxPrice: row.max_price == null ? null : Number(row.max_price),
      undercutAmount: Number(row.undercut_amount ?? DEFAULT_UNDERCUT),
      updatedAt: row.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function upsertRepriceRule(
  input: Omit<AmazonRepriceRule, "updatedAt">,
): Promise<AmazonRepriceRule> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is required to save reprice rules.");
  }
  const supabase = createSupabaseAdmin();
  const payload = {
    sku: input.sku.trim(),
    enabled: input.enabled,
    strategy: input.strategy,
    min_price: input.minPrice,
    max_price: input.maxPrice,
    undercut_amount: input.undercutAmount,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("amazon_reprice_rules")
    .upsert(payload, { onConflict: "sku" })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to save reprice rule.");
  }
  return {
    sku: data.sku,
    enabled: data.enabled,
    strategy: data.strategy as RepriceStrategy,
    minPrice: data.min_price == null ? null : Number(data.min_price),
    maxPrice: data.max_price == null ? null : Number(data.max_price),
    undercutAmount: Number(data.undercut_amount ?? DEFAULT_UNDERCUT),
    updatedAt: data.updated_at,
  };
}

export async function buildRepriceSuggestion(input: {
  sku: string;
  currentPrice: number | null;
  rule?: AmazonRepriceRule | null;
}): Promise<RepriceSuggestion> {
  let competitive: AmazonCompetitiveSnapshot | null = null;
  try {
    competitive = await getCompetitiveSnapshot(input.sku, input.currentPrice);
  } catch {
    competitive = null;
  }
  const rule = input.rule ?? null;
  const { suggestedPrice, reason } = computeSuggestedPrice({
    currentPrice: input.currentPrice,
    competitive,
    rule,
  });
  return {
    sku: input.sku,
    currentPrice: input.currentPrice,
    suggestedPrice,
    reason,
    competitive,
    rule,
  };
}

export async function logRepriceEvent(input: {
  sku: string;
  fromPrice?: number | null;
  toPrice: number;
  source?: string;
  reason?: string | null;
  status?: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createSupabaseAdmin();
    await supabase.from("amazon_reprice_events").insert({
      sku: input.sku.trim(),
      from_price: input.fromPrice ?? null,
      to_price: roundMoney(input.toPrice),
      source: input.source ?? "manual",
      reason: input.reason ?? null,
      status: input.status ?? "applied",
    });
  } catch {
    // History logging should never block price updates.
  }
}

export async function listRepriceEvents(options?: {
  days?: number;
  limit?: number;
  sku?: string;
}): Promise<AmazonRepriceEvent[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const days = options?.days ?? 7;
    const limit = options?.limit ?? 100;
    const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
    const supabase = createSupabaseAdmin();
    let query = supabase
      .from("amazon_reprice_events")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (options?.sku?.trim()) {
      query = query.eq("sku", options.sku.trim());
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((row) => ({
      id: Number(row.id),
      sku: row.sku,
      fromPrice: row.from_price == null ? null : Number(row.from_price),
      toPrice: Number(row.to_price),
      source: row.source,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function updateAmazonListingPrice(input: {
  sku: string;
  price: number;
  seedSkuForSellerId?: string;
  fromPrice?: number | null;
  reason?: string | null;
  source?: string;
}): Promise<{ sku: string; price: number; status: string }> {
  const price = roundMoney(input.price);
  if (!(price > 0)) {
    throw new Error("Price must be greater than zero.");
  }

  const { marketplaceId } = getAmazonConfig();
  const sellerId = await resolveAmazonSellerId(
    input.seedSkuForSellerId || input.sku,
  );

  const result = await amazonFetch<{ status?: string; sku?: string }>({
    method: "PATCH",
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(input.sku)}`,
    query: { marketplaceIds: marketplaceId },
    body: {
      productType: "PRODUCT",
      patches: [
        {
          op: "replace",
          path: "/attributes/purchasable_offer",
          value: [
            {
              marketplace_id: marketplaceId,
              currency: "GBP",
              our_price: [{ schedule: [{ value_with_tax: price }] }],
            },
          ],
        },
      ],
    },
  });

  const status = result.status || "ACCEPTED";
  await logRepriceEvent({
    sku: input.sku,
    fromPrice: input.fromPrice,
    toPrice: price,
    source: input.source ?? "manual",
    reason: input.reason,
    status: "applied",
  });

  return {
    sku: input.sku,
    price,
    status,
  };
}

export type AutoRepriceResult = {
  checked: number;
  applied: number;
  skipped: number;
  failed: number;
  results: Array<{
    sku: string;
    status: "applied" | "skipped" | "failed";
    reason: string;
    fromPrice?: number | null;
    toPrice?: number | null;
  }>;
};

/**
 * Check enabled non-manual rules against live offers and apply price updates.
 * Requires a min price on each rule before auto-applying (safety floor).
 */
export async function runAmazonAutoReprice(): Promise<AutoRepriceResult> {
  const rules = (await listRepriceRules()).filter(
    (rule) => rule.enabled && rule.strategy !== "manual",
  );

  const listings = await fetchAmazonListings().catch(() => null);
  const priceBySku = new Map(
    (listings?.listings ?? []).map((listing) => [listing.sku, listing.price]),
  );

  const results: AutoRepriceResult["results"] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of rules) {
    if (rule.minPrice == null) {
      skipped += 1;
      results.push({
        sku: rule.sku,
        status: "skipped",
        reason: "Set a min price before auto-reprice will apply.",
      });
      continue;
    }

    try {
      const currentPrice = priceBySku.get(rule.sku) ?? null;
      const suggestion = await buildRepriceSuggestion({
        sku: rule.sku,
        currentPrice,
        rule,
      });

      if (suggestion.suggestedPrice == null) {
        skipped += 1;
        results.push({
          sku: rule.sku,
          status: "skipped",
          reason: suggestion.reason,
          fromPrice: currentPrice,
        });
        continue;
      }

      if (suggestion.suggestedPrice < rule.minPrice) {
        skipped += 1;
        results.push({
          sku: rule.sku,
          status: "skipped",
          reason: `Suggested £${suggestion.suggestedPrice.toFixed(2)} below min £${rule.minPrice.toFixed(2)}.`,
          fromPrice: currentPrice,
          toPrice: suggestion.suggestedPrice,
        });
        continue;
      }

      const update = await updateAmazonListingPrice({
        sku: rule.sku,
        price: suggestion.suggestedPrice,
        fromPrice: currentPrice,
        reason: suggestion.reason,
        source: "cron",
      });
      applied += 1;
      results.push({
        sku: rule.sku,
        status: "applied",
        reason: suggestion.reason,
        fromPrice: currentPrice,
        toPrice: update.price,
      });
    } catch (error) {
      failed += 1;
      results.push({
        sku: rule.sku,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    checked: rules.length,
    applied,
    skipped,
    failed,
    results,
  };
}
