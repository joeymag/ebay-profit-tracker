import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  listRepriceEventsForChannel,
  listRepriceRulesForChannel,
  upsertRepriceRuleForChannel,
} from "@/lib/amazon/reprice/shared/rules-store";
import { computeSuggestedPrice } from "@/lib/amazon/reprice/shared/suggest";
import type {
  AmazonRepriceRule,
  AutoRepriceResult,
  QuantityDiscountPlan,
  RepriceStrategy,
  RepriceSuggestion,
} from "@/lib/amazon/reprice/shared/types";
import { updateStandardListingPrice } from "@/lib/amazon/reprice/standard/apply-price";
import {
  getStandardCompetitiveSnapshot,
  getStandardCompetitiveSnapshotsBatch,
} from "@/lib/amazon/reprice/standard/competitive";

const CHANNEL = "standard" as const;

export async function listStandardRepriceRules(): Promise<AmazonRepriceRule[]> {
  return listRepriceRulesForChannel(CHANNEL);
}

export async function upsertStandardRepriceRule(input: {
  sku: string;
  enabled: boolean;
  strategy: RepriceStrategy;
  minPrice: number | null;
  maxPrice: number | null;
  undercutAmount: number;
  gapOffsetAmount?: number;
  gapOffsetPercent?: number;
}): Promise<AmazonRepriceRule> {
  return upsertRepriceRuleForChannel(CHANNEL, {
    ...input,
    quantityDiscountPlan: null,
  });
}

export async function listStandardRepriceEvents(options?: {
  days?: number;
  limit?: number;
  sku?: string;
}) {
  return listRepriceEventsForChannel({ channel: CHANNEL, ...options });
}

export async function buildStandardRepriceSuggestion(input: {
  sku: string;
  currentPrice: number | null;
  rule?: AmazonRepriceRule | null;
}): Promise<RepriceSuggestion> {
  let competitive = null;
  try {
    competitive = await getStandardCompetitiveSnapshot(
      input.sku,
      input.currentPrice,
    );
  } catch {
    competitive = null;
  }
  const rule = input.rule ?? null;
  const { suggestedPrice, reason } = computeSuggestedPrice({
    currentPrice: input.currentPrice,
    competitive,
    rule,
    channel: CHANNEL,
    emptyCompetitiveReason: "No competitive data.",
  });
  return {
    sku: input.sku,
    channel: CHANNEL,
    currentPrice: input.currentPrice,
    suggestedPrice,
    reason,
    competitive,
    rule,
  };
}

export async function enrichStandardCompetitive(input: {
  skus: string[];
  prices?: Record<string, number | null>;
  bypassCache?: boolean;
}) {
  const priceBySku = new Map<string, number | null>();
  if (input.prices) {
    for (const [sku, value] of Object.entries(input.prices)) {
      priceBySku.set(sku, value);
    }
  }

  // Business prices are owned by the Business module; import lazily for display.
  const { fetchBusinessOffersBatch } = await import(
    "@/lib/amazon/reprice/business/offer"
  );

  const [rules, competitiveBySku, businessOffers] = await Promise.all([
    listStandardRepriceRules(),
    getStandardCompetitiveSnapshotsBatch({
      skus: input.skus,
      priceBySku,
      bypassCache: input.bypassCache,
    }),
    fetchBusinessOffersBatch(input.skus),
  ]);
  const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

  return input.skus.map((sku) => {
    const rule = ruleBySku.get(sku.trim()) ?? null;
    const competitive = competitiveBySku.get(sku) ?? null;
    const currentPrice = priceBySku.has(sku) ? priceBySku.get(sku)! : null;
    const businessPrice = businessOffers.get(sku)?.businessPrice ?? null;
    const { suggestedPrice, reason } = computeSuggestedPrice({
      currentPrice,
      competitive,
      rule,
      channel: CHANNEL,
      emptyCompetitiveReason: "Could not load Buy Box data.",
    });
    return {
      sku,
      channel: CHANNEL,
      currentPrice,
      standardPrice: currentPrice,
      businessPrice,
      quantityDiscountPlan: null as QuantityDiscountPlan | null,
      competitive,
      suggestedPrice,
      reason: competitive == null ? "Could not load Buy Box data." : reason,
      rule,
    };
  });
}

export async function loadStandardRepricerRows() {
  const [{ listings }, rules] = await Promise.all([
    fetchAmazonListings({ fast: true }),
    listStandardRepriceRules(),
  ]);
  const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

  return listings.map((listing) => {
    const rule = ruleBySku.get(listing.sku.trim()) ?? null;
    const standardPrice = listing.price;
    const { suggestedPrice, reason } = computeSuggestedPrice({
      currentPrice: standardPrice,
      competitive: null,
      rule,
      channel: CHANNEL,
    });
    return {
      ...listing,
      price: standardPrice,
      standardPrice,
      businessPrice: null as number | null,
      channel: CHANNEL,
      rule,
      competitive: null,
      quantityDiscountPlan: null as QuantityDiscountPlan | null,
      suggestedPrice,
      reason:
        rule?.enabled && rule.strategy !== "manual"
          ? "Loading Buy Box…"
          : reason,
    };
  });
}

export async function runStandardAutoReprice(): Promise<AutoRepriceResult> {
  const rules = (await listStandardRepriceRules()).filter(
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
        channel: CHANNEL,
        status: "skipped",
        reason: "Set a min price before auto-reprice will apply.",
      });
      continue;
    }

    try {
      const currentPrice = priceBySku.get(rule.sku) ?? null;
      const suggestion = await buildStandardRepriceSuggestion({
        sku: rule.sku,
        currentPrice,
        rule,
      });

      if (suggestion.suggestedPrice == null) {
        skipped += 1;
        results.push({
          sku: rule.sku,
          channel: CHANNEL,
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
          channel: CHANNEL,
          status: "skipped",
          reason: `Suggested £${suggestion.suggestedPrice.toFixed(2)} below min £${rule.minPrice.toFixed(2)}.`,
          fromPrice: currentPrice,
          toPrice: suggestion.suggestedPrice,
        });
        continue;
      }

      const update = await updateStandardListingPrice({
        sku: rule.sku,
        price: suggestion.suggestedPrice,
        fromPrice: currentPrice,
        reason: suggestion.reason,
        source: "cron",
      });
      applied += 1;
      results.push({
        sku: rule.sku,
        channel: CHANNEL,
        status: "applied",
        reason: suggestion.reason,
        fromPrice: currentPrice,
        toPrice: update.price,
      });
    } catch (error) {
      failed += 1;
      results.push({
        sku: rule.sku,
        channel: CHANNEL,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return { checked: rules.length, applied, skipped, failed, results };
}
