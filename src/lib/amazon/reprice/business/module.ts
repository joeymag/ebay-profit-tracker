import { fetchAmazonListings } from "@/lib/amazon/listings";
import { updateBusinessListingPrice } from "@/lib/amazon/reprice/business/apply-price";
import {
  getBusinessCompetitiveSnapshot,
  getBusinessCompetitiveSnapshotsBatch,
} from "@/lib/amazon/reprice/business/competitive";
import {
  fetchBusinessOffer,
  fetchBusinessOffersBatch,
} from "@/lib/amazon/reprice/business/offer";
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
  RunAutoRepriceOptions,
} from "@/lib/amazon/reprice/shared/types";

const CHANNEL = "business" as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSkuFilter(skus: string[] | undefined): Set<string> | null {
  if (skus == null) return null;
  return new Set(
    skus.map((sku) => sku.trim()).filter((sku) => sku.length > 0),
  );
}

export async function listBusinessRepriceRules(): Promise<AmazonRepriceRule[]> {
  return listRepriceRulesForChannel(CHANNEL);
}

export async function upsertBusinessRepriceRule(input: {
  sku: string;
  enabled: boolean;
  strategy: RepriceStrategy;
  minPrice: number | null;
  maxPrice: number | null;
  undercutAmount: number;
  quantityDiscountPlan?: QuantityDiscountPlan | null;
}): Promise<AmazonRepriceRule> {
  return upsertRepriceRuleForChannel(CHANNEL, input);
}

export async function listBusinessRepriceEvents(options?: {
  days?: number;
  limit?: number;
  sku?: string;
}) {
  return listRepriceEventsForChannel({ channel: CHANNEL, ...options });
}

export async function buildBusinessRepriceSuggestion(input: {
  sku: string;
  currentPrice: number | null;
  rule?: AmazonRepriceRule | null;
}): Promise<RepriceSuggestion> {
  let competitive = null;
  try {
    competitive = await getBusinessCompetitiveSnapshot(
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
    emptyCompetitiveReason: "No Business competitive data.",
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

export async function enrichBusinessCompetitive(input: {
  skus: string[];
  /** Standard list prices (for side-by-side display). */
  standardPrices?: Record<string, number | null>;
  bypassCache?: boolean;
}) {
  const businessOffers = await fetchBusinessOffersBatch(input.skus);
  const priceBySku = new Map<string, number | null>();
  for (const sku of input.skus) {
    priceBySku.set(sku, businessOffers.get(sku)?.businessPrice ?? null);
  }

  const [rules, competitiveBySku] = await Promise.all([
    listBusinessRepriceRules(),
    getBusinessCompetitiveSnapshotsBatch({
      skus: input.skus,
      priceBySku,
      bypassCache: input.bypassCache,
    }),
  ]);
  const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

  return input.skus.map((sku) => {
    const rule = ruleBySku.get(sku.trim()) ?? null;
    const competitive = competitiveBySku.get(sku) ?? null;
    const businessOffer = businessOffers.get(sku);
    const businessPrice = businessOffer?.businessPrice ?? null;
    const standardPrice =
      input.standardPrices && sku in input.standardPrices
        ? input.standardPrices[sku]!
        : null;
    const { suggestedPrice, reason } = computeSuggestedPrice({
      currentPrice: businessPrice,
      competitive,
      rule,
      channel: CHANNEL,
      emptyCompetitiveReason: "No Business competitive data.",
    });
    return {
      sku,
      channel: CHANNEL,
      currentPrice: businessPrice,
      standardPrice,
      businessPrice,
      quantityDiscountPlan:
        rule?.quantityDiscountPlan ??
        businessOffer?.quantityDiscountPlan ??
        null,
      competitive,
      suggestedPrice,
      reason:
        competitive == null ? "No Business competitive data." : reason,
      rule,
    };
  });
}

export async function loadBusinessRepricerRows() {
  const [{ listings }, rules] = await Promise.all([
    fetchAmazonListings({ fast: true }),
    listBusinessRepriceRules(),
  ]);
  const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

  return listings.map((listing) => {
    const rule = ruleBySku.get(listing.sku.trim()) ?? null;
    const standardPrice = listing.price;
    const { suggestedPrice, reason } = computeSuggestedPrice({
      currentPrice: null,
      competitive: null,
      rule,
      channel: CHANNEL,
    });
    return {
      ...listing,
      price: null as number | null,
      standardPrice,
      businessPrice: null as number | null,
      channel: CHANNEL,
      rule,
      competitive: null,
      quantityDiscountPlan: rule?.quantityDiscountPlan ?? null,
      suggestedPrice,
      reason:
        rule?.enabled && rule.strategy !== "manual"
          ? "Loading Business pricing…"
          : reason,
    };
  });
}

export async function runBusinessAutoReprice(
  options?: RunAutoRepriceOptions,
): Promise<AutoRepriceResult> {
  const skuFilter = normalizeSkuFilter(options?.skus);
  if (skuFilter && skuFilter.size === 0) {
    return { checked: 0, applied: 0, skipped: 0, failed: 0, results: [] };
  }

  const source = options?.source?.trim() || "cron";
  const pauseBetweenSkusMs = options?.pauseBetweenSkusMs ?? 300;
  const batchSize = options?.batchSize ?? 0;
  const pauseBetweenBatchesMs = options?.pauseBetweenBatchesMs ?? 0;

  const rules = (await listBusinessRepriceRules()).filter((rule) => {
    if (!rule.enabled || rule.strategy === "manual") return false;
    if (skuFilter && !skuFilter.has(rule.sku.trim())) return false;
    return true;
  });

  const results: AutoRepriceResult["results"] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  const actionable = rules.filter((rule) => rule.minPrice != null);
  for (const rule of rules) {
    if (rule.minPrice == null) {
      skipped += 1;
      results.push({
        sku: rule.sku,
        channel: CHANNEL,
        status: "skipped",
        reason: "Set a min price before auto-reprice will apply.",
      });
    }
  }

  // Prefetch Business offers (limited concurrency) + competitive batch (SP-API batch).
  const skus = actionable.map((rule) => rule.sku.trim());
  const offersBySku = await fetchBusinessOffersBatch(skus, { concurrency: 5 });
  const priceBySku = new Map<string, number | null>();
  for (const sku of skus) {
    priceBySku.set(sku, offersBySku.get(sku)?.businessPrice ?? null);
  }
  const competitiveBySku = await getBusinessCompetitiveSnapshotsBatch({
    skus,
    priceBySku,
    bypassCache: true,
  });

  for (let index = 0; index < actionable.length; index += 1) {
    const rule = actionable[index]!;
    try {
      const offer = offersBySku.get(rule.sku.trim());
      const currentPrice = offer?.businessPrice ?? null;
      const competitive = competitiveBySku.get(rule.sku.trim()) ?? null;
      const { suggestedPrice, reason } = computeSuggestedPrice({
        currentPrice,
        competitive,
        rule,
        channel: CHANNEL,
        emptyCompetitiveReason: "No Business competitive data.",
      });

      if (suggestedPrice == null) {
        skipped += 1;
        results.push({
          sku: rule.sku,
          channel: CHANNEL,
          status: "skipped",
          reason,
          fromPrice: currentPrice,
        });
      } else {
        const update = await updateBusinessListingPrice({
          sku: rule.sku,
          price: suggestedPrice,
          quantityDiscountPlan:
            rule.quantityDiscountPlan ?? offer?.quantityDiscountPlan ?? null,
          fromPrice: currentPrice,
          reason,
          source,
        });
        applied += 1;
        results.push({
          sku: rule.sku,
          channel: CHANNEL,
          status: "applied",
          reason,
          fromPrice: currentPrice,
          toPrice: update.price,
        });
      }
    } catch (error) {
      failed += 1;
      results.push({
        sku: rule.sku,
        channel: CHANNEL,
        status: "failed",
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }

    if (index + 1 < actionable.length) {
      if (pauseBetweenSkusMs > 0) await sleep(pauseBetweenSkusMs);
      if (
        batchSize > 0 &&
        pauseBetweenBatchesMs > 0 &&
        (index + 1) % batchSize === 0
      ) {
        await sleep(pauseBetweenBatchesMs);
      }
    }
  }

  return { checked: rules.length, applied, skipped, failed, results };
}
