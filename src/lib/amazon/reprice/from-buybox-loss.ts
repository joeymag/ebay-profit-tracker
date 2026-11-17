import type { BuyBoxMonitorRow } from "@/lib/amazon/buybox-monitor";
import { runStandardAutoReprice } from "@/lib/amazon/reprice/standard";
import type { AutoRepriceResult } from "@/lib/amazon/reprice/shared/types";
import { emptyAutoRepriceResult } from "@/lib/amazon/reprice/shared/types";

/** Match buybox-monitor.ts pacing to reduce SP-API rate-limit pressure. */
const BATCH_SIZE = 5;
const PAUSE_BETWEEN_SKUS_MS = 450;
const PAUSE_BETWEEN_BATCHES_MS = 2500;

/**
 * After a Consumer Buy Box monitor run, immediately reprice SKUs that lost.
 *
 * Safety:
 * - Only `lost` rows (weWinBuyBox === false) — never won or failed checks
 * - Standard channel only (monitor uses CustomerType Consumer)
 * - Still requires enabled, non-manual rules + min price (via runStandardAutoReprice)
 * - Per-SKU errors are collected; this helper never throws for individual failures
 */
export async function repriceSkusThatLostBuyBox(
  lost: BuyBoxMonitorRow[],
): Promise<AutoRepriceResult> {
  const skus = [
    ...new Set(
      lost
        .filter((row) => row.weWinBuyBox === false && row.sku?.trim())
        .map((row) => row.sku.trim()),
    ),
  ];

  if (skus.length === 0) {
    return emptyAutoRepriceResult();
  }

  try {
    return await runStandardAutoReprice({
      skus,
      source: "buybox-check",
      pauseBetweenSkusMs: PAUSE_BETWEEN_SKUS_MS,
      batchSize: BATCH_SIZE,
      pauseBetweenBatchesMs: PAUSE_BETWEEN_BATCHES_MS,
    });
  } catch (error) {
    // Catastrophic failure (e.g. listings fetch blew up unexpectedly) —
    // surface as one failed row so the monitor response still succeeds.
    const reason =
      error instanceof Error ? error.message : "Buy Box → reprice handoff failed.";
    return {
      checked: skus.length,
      applied: 0,
      skipped: 0,
      failed: skus.length,
      results: skus.map((sku) => ({
        sku,
        channel: "standard" as const,
        status: "failed" as const,
        reason,
      })),
    };
  }
}
