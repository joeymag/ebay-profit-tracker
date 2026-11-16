import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { readFileSync, writeFileSync } from "fs";
import { fetchAmazonListings } from "../src/lib/amazon/listings";
import {
  fetchBusinessOffersBatch,
  getBusinessCompetitiveSnapshotsBatch,
} from "../src/lib/amazon/reprice/business";
import { computeSuggestedPrice } from "../src/lib/amazon/reprice/shared/suggest";
import type {
  AmazonRepriceRule,
  QuantityDiscountPlan,
  RepriceStrategy,
} from "../src/lib/amazon/reprice/shared/types";
import { getStandardCompetitiveSnapshotsBatch } from "../src/lib/amazon/reprice/standard";

/** Previous Standard live-run logic for comparison. */
const OLD_UNDERCUT = 0.02;

/** Offset scenarios to compare against true midpoint (0). */
const OFFSET_SCENARIOS: Array<{
  key: string;
  label: string;
  gapOffsetAmount: number;
  gapOffsetPercent: number;
}> = [
  { key: "mid0", label: "mid ±£0.00", gapOffsetAmount: 0, gapOffsetPercent: 0 },
  {
    key: "plus5p",
    label: "mid +£0.05",
    gapOffsetAmount: 0.05,
    gapOffsetPercent: 0,
  },
  {
    key: "minus5p",
    label: "mid −£0.05",
    gapOffsetAmount: -0.05,
    gapOffsetPercent: 0,
  },
  {
    key: "gap25",
    label: "mid +25% of gap",
    gapOffsetAmount: 0,
    gapOffsetPercent: 0.25,
  },
];

type RawRule = {
  sku: string;
  channel: string;
  enabled: boolean;
  strategy: string;
  min_price: number | null;
  max_price: number | null;
  undercut_amount: number | null;
  gap_offset_amount?: number | null;
  gap_offset_percent?: number | null;
  quantity_discount_plan?: QuantityDiscountPlan | null;
  updated_at: string;
};

function mapRule(row: RawRule): AmazonRepriceRule {
  return {
    sku: row.sku.trim(),
    channel: row.channel === "business" ? "business" : "standard",
    enabled: Boolean(row.enabled),
    strategy: row.strategy as RepriceStrategy,
    minPrice: row.min_price == null ? null : Number(row.min_price),
    maxPrice: row.max_price == null ? null : Number(row.max_price),
    undercutAmount: Number(row.undercut_amount ?? 0.01),
    gapOffsetAmount: Number(row.gap_offset_amount ?? 0),
    gapOffsetPercent: Number(row.gap_offset_percent ?? 0),
    quantityDiscountPlan: row.quantity_discount_plan ?? null,
    updatedAt: row.updated_at,
  };
}

function priceDiffers(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) >= 0.005;
}

function computeOldTwoPenceSuggestion(input: {
  currentPrice: number | null;
  buyBoxPrice: number | null;
  youHaveBuyBox: boolean | null;
  rule: AmazonRepriceRule | null;
}): { suggestedPrice: number | null; reason: string } {
  const rule = input.rule;
  if (!rule || !rule.enabled) {
    return { suggestedPrice: null, reason: "No active reprice rule." };
  }
  if (input.youHaveBuyBox) {
    return { suggestedPrice: null, reason: "You already hold the Buy Box." };
  }
  if (input.buyBoxPrice == null) {
    return { suggestedPrice: null, reason: "No Buy Box price to beat." };
  }
  let target = input.buyBoxPrice - OLD_UNDERCUT;
  let reason = `Beat Buy Box (£${input.buyBoxPrice.toFixed(2)}) by £${OLD_UNDERCUT.toFixed(2)}`;
  if (rule.minPrice != null && target < rule.minPrice) {
    target = rule.minPrice;
    reason += ` · floored at min £${rule.minPrice.toFixed(2)}`;
  }
  if (rule.maxPrice != null && target > rule.maxPrice) {
    target = rule.maxPrice;
    reason += ` · capped at max £${rule.maxPrice.toFixed(2)}`;
  }
  target = Math.round(target * 100) / 100;
  if (
    input.currentPrice != null &&
    Math.abs(target - input.currentPrice) < 0.005
  ) {
    return { suggestedPrice: null, reason: "Already at suggested price." };
  }
  return { suggestedPrice: target, reason };
}

async function main() {
  const rawRules = JSON.parse(
    readFileSync("scripts/live-amazon-reprice-rules.json", "utf8"),
  ) as RawRule[];
  const allRules = rawRules.map(mapRule);
  const standardRules = allRules.filter((r) => r.channel === "standard");
  const businessRules = allRules.filter((r) => r.channel === "business");

  const { listings } = await fetchAmazonListings({ fast: true });
  const priceBySku = new Map(
    listings.map((listing) => [listing.sku.trim(), listing.price]),
  );

  const standardBySku = new Map(standardRules.map((r) => [r.sku, r]));
  const businessBySku = new Map(businessRules.map((r) => [r.sku, r]));
  const skus = [
    ...new Set([...standardBySku.keys(), ...businessBySku.keys()]),
  ].sort();

  console.error(
    `Loaded ${listings.length} listings, ${standardRules.length} standard rules, ${businessRules.length} business rules, processing ${skus.length} SKUs…`,
  );

  const standardCompetitive = await getStandardCompetitiveSnapshotsBatch({
    skus,
    priceBySku,
    bypassCache: true,
  });

  const businessSkus = [...businessBySku.keys()];
  const businessOffers = await fetchBusinessOffersBatch(businessSkus);
  const businessCompetitive = await getBusinessCompetitiveSnapshotsBatch({
    skus: businessSkus,
    priceBySku: new Map(
      businessSkus.map((sku) => [
        sku,
        businessOffers.get(sku)?.businessPrice ?? null,
      ]),
    ),
    bypassCache: true,
  });

  const rows: Array<Record<string, unknown>> = [];

  for (const sku of skus) {
    const currentStandard = priceBySku.get(sku) ?? null;
    const standardRule = standardBySku.get(sku) ?? null;
    const competitive = standardCompetitive.get(sku) ?? null;

    const standardRuleForRun: AmazonRepriceRule | null = standardRule
      ? {
          ...standardRule,
          enabled: true,
          strategy: "undercut_buybox",
          // Force true-mid defaults; scenarios override via call args.
          gapOffsetAmount: 0,
          gapOffsetPercent: 0,
        }
      : null;

    const byOffset: Record<
      string,
      { suggestedPrice: number | null; reason: string }
    > = {};
    for (const scenario of OFFSET_SCENARIOS) {
      byOffset[scenario.key] = computeSuggestedPrice({
        currentPrice: currentStandard,
        competitive,
        rule: standardRuleForRun,
        channel: "standard",
        gapOffsetAmount: scenario.gapOffsetAmount,
        gapOffsetPercent: scenario.gapOffsetPercent,
      });
    }

    const standardOld = computeOldTwoPenceSuggestion({
      currentPrice: currentStandard,
      buyBoxPrice: competitive?.buyBoxPrice ?? null,
      youHaveBuyBox: competitive?.youHaveBuyBox ?? null,
      rule: standardRuleForRun,
    });

    const businessRule = businessBySku.get(sku) ?? null;
    const businessCurrent = businessOffers.get(sku)?.businessPrice ?? null;
    const businessComp = businessCompetitive.get(sku) ?? null;
    const businessSuggestion = computeSuggestedPrice({
      currentPrice: businessCurrent,
      competitive: businessComp,
      rule: businessRule,
      channel: "business",
      emptyCompetitiveReason: "No Business competitive data.",
    });

    const mid = byOffset.mid0;
    rows.push({
      sku,
      standardCurrent: currentStandard,
      buyBox: competitive?.buyBoxPrice ?? null,
      youHaveBuyBox: competitive?.youHaveBuyBox ?? null,
      standardMin: standardRule?.minPrice ?? null,
      standardMax: standardRule?.maxPrice ?? null,
      standardMid0: mid.suggestedPrice,
      standardMid0Reason: mid.reason,
      standardPlus5p: byOffset.plus5p.suggestedPrice,
      standardMinus5p: byOffset.minus5p.suggestedPrice,
      standardGap25: byOffset.gap25.suggestedPrice,
      standardSuggestedOld02: standardOld.suggestedPrice,
      differsFromOld02: priceDiffers(mid.suggestedPrice, standardOld.suggestedPrice),
      businessCurrent,
      businessSuggested: businessSuggestion.suggestedPrice,
      businessReason: businessSuggestion.reason,
      hasStandardRule: Boolean(standardRule),
      hasBusinessRule: Boolean(businessRule),
    });
  }

  const payload = {
    ok: true,
    listingCount: listings.length,
    standardRules: standardRules.length,
    businessRules: businessRules.length,
    processed: rows.length,
    offsetScenarios: OFFSET_SCENARIOS,
    oldLogicCompared: `Buy Box minus £${OLD_UNDERCUT.toFixed(2)}`,
    rows,
  };

  writeFileSync(
    "scripts/debug-amazon-dual-reprice-live.clean.json",
    JSON.stringify(payload, null, 2),
  );
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
