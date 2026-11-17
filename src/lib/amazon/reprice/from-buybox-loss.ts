import type { BuyBoxMonitorRow } from "@/lib/amazon/buybox-monitor";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import { updateStandardListingPrice } from "@/lib/amazon/reprice/standard/apply-price";
import { listStandardRepriceRules } from "@/lib/amazon/reprice/standard/module";
import { withStandardRepriceLock } from "@/lib/amazon/reprice/shared/sku-lock";
import { computeSuggestedPrice } from "@/lib/amazon/reprice/shared/suggest";
import type { AutoRepriceResult } from "@/lib/amazon/reprice/shared/types";
import { emptyAutoRepriceResult } from "@/lib/amazon/reprice/shared/types";

/** Match buybox-monitor.ts pacing to reduce SP-API rate-limit pressure. */
const BATCH_SIZE = 5;
const PAUSE_BETWEEN_SKUS_MS = 450;
const PAUSE_BETWEEN_BATCHES_MS = 2500;
const LOCK_HOLDER = "buybox-check";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After a Consumer Buy Box monitor run, immediately reprice SKUs that lost.
 *
 * Safety:
 * - Only `lost` rows (weWinBuyBox === false) — never won or failed checks
 * - Standard channel only (monitor uses CustomerType Consumer)
 * - Reuses `row.competitive` from the checker (no second offers fetch)
 * - Still requires enabled, non-manual rules + min price
 * - Per-SKU errors are collected; this helper never throws for individual failures
 */
export async function repriceSkusThatLostBuyBox(
  lost: BuyBoxMonitorRow[],
): Promise<AutoRepriceResult> {
  const lostRows = lost.filter(
    (row) => row.weWinBuyBox === false && row.sku?.trim(),
  );
  if (lostRows.length === 0) {
    return emptyAutoRepriceResult();
  }

  const rules = (await listStandardRepriceRules()).filter(
    (rule) => rule.enabled && rule.strategy !== "manual",
  );
  const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

  const listings = await fetchAmazonListings().catch(() => null);
  const priceBySku = new Map(
    (listings?.listings ?? []).map((listing) => [listing.sku, listing.price]),
  );

  const results: AutoRepriceResult["results"] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  let checked = 0;

  for (let index = 0; index < lostRows.length; index += 1) {
    const row = lostRows[index]!;
    const sku = row.sku.trim();
    const rule = ruleBySku.get(sku) ?? null;
    checked += 1;

    if (!rule) {
      skipped += 1;
      results.push({
        sku,
        channel: "standard",
        status: "skipped",
        reason: "No enabled Standard reprice rule.",
      });
    } else if (rule.minPrice == null) {
      skipped += 1;
      results.push({
        sku,
        channel: "standard",
        status: "skipped",
        reason: "Set a min price before auto-reprice will apply.",
      });
    } else if (!row.competitive) {
      skipped += 1;
      results.push({
        sku,
        channel: "standard",
        status: "skipped",
        reason: "No competitive snapshot from Buy Box check to reuse.",
      });
    } else {
      try {
        const currentPrice =
          priceBySku.get(sku) ??
          row.liveOurPrice ??
          row.competitive.yourOfferPrice ??
          null;
        const { suggestedPrice, reason } = computeSuggestedPrice({
          currentPrice,
          competitive: row.competitive,
          rule,
          channel: "standard",
        });

        if (suggestedPrice == null) {
          skipped += 1;
          results.push({
            sku,
            channel: "standard",
            status: "skipped",
            reason,
            fromPrice: currentPrice,
          });
        } else {
          const locked = await withStandardRepriceLock({
            sku,
            holder: LOCK_HOLDER,
            fn: () =>
              updateStandardListingPrice({
                sku,
                price: suggestedPrice,
                fromPrice: currentPrice,
                reason,
                source: "buybox-check",
              }),
          });
          if (!locked.acquired) {
            skipped += 1;
            results.push({
              sku,
              channel: "standard",
              status: "skipped",
              reason: locked.reason,
              fromPrice: currentPrice,
              toPrice: suggestedPrice,
            });
          } else {
            applied += 1;
            results.push({
              sku,
              channel: "standard",
              status: "applied",
              reason,
              fromPrice: currentPrice,
              toPrice: locked.value.price,
            });
          }
        }
      } catch (error) {
        failed += 1;
        results.push({
          sku,
          channel: "standard",
          status: "failed",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    if (index + 1 < lostRows.length) {
      await sleep(PAUSE_BETWEEN_SKUS_MS);
      if ((index + 1) % BATCH_SIZE === 0) {
        await sleep(PAUSE_BETWEEN_BATCHES_MS);
      }
    }
  }

  return { checked, applied, skipped, failed, results };
}
