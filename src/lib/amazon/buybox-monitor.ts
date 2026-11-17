import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import { fetchListingOffersForCustomerType } from "@/lib/amazon/reprice/shared/competitive-engine";
import { resolveAmazonSellerId } from "@/lib/amazon/reprice/shared/seller-id";

const BATCH_SIZE = 5;
const PAUSE_BETWEEN_SKUS_MS = 450;
const PAUSE_BETWEEN_BATCHES_MS = 2500;

export type BuyBoxMonitorSeedRow = {
  sku: string;
  fromPrice?: number | null;
  toPrice?: number | null;
  rivalAtChange?: number | null;
};

export type BuyBoxMonitorRow = {
  sku: string;
  fromPrice: number | null;
  toPrice: number | null;
  rivalAtChange: number | null;
  liveOurPrice?: number | null;
  liveBuyBoxPrice?: number | null;
  weWinBuyBox: boolean | null;
  rivalSellerId?: string | null;
  rivalPrice?: number | null;
  offerCount?: number;
  error?: string;
};

export type BuyBoxMonitorPayload = {
  pulledAt: string;
  sourceFile: string | null;
  ourSellerId: string;
  checkedCount: number;
  wonCount: number;
  lostCount: number;
  failedCount: number;
  outputFile: string | null;
  won: BuyBoxMonitorRow[];
  lost: BuyBoxMonitorRow[];
  failed: BuyBoxMonitorRow[];
  rows: BuyBoxMonitorRow[];
};

type SweepFileShape = {
  pulledAt?: string;
  lost?: BuyBoxMonitorSeedRow[];
  failed?: BuyBoxMonitorSeedRow[];
  rows?: BuyBoxMonitorSeedRow[];
};

function scriptsDir(): string {
  return join(process.cwd(), "scripts");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryReadJson(path: string): SweepFileShape | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as SweepFileShape;
  } catch {
    return null;
  }
}

function seedKey(row: BuyBoxMonitorSeedRow): string {
  return row.sku.trim();
}

/** Prefer lost SKUs; also keep prior 429 failures so they get another look. */
function seedsFromSweep(
  data: SweepFileShape | null,
  options?: { includeFailed?: boolean },
): BuyBoxMonitorSeedRow[] {
  if (!data) return [];
  const bySku = new Map<string, BuyBoxMonitorSeedRow>();
  for (const row of data.lost ?? []) {
    if (row?.sku?.trim()) bySku.set(seedKey(row), row);
  }
  if (options?.includeFailed !== false) {
    for (const row of data.failed ?? []) {
      if (row?.sku?.trim() && !bySku.has(seedKey(row))) {
        bySku.set(seedKey(row), row);
      }
    }
  }
  return [...bySku.values()];
}

/**
 * Resolve the most recent sweep/monitor results to decide which SKUs to recheck.
 * Order: newest timestamped monitor file → stable latest pointer → post-10p out.json.
 */
export function loadBuyBoxWatchSeeds(): {
  seeds: BuyBoxMonitorSeedRow[];
  sourceFile: string | null;
} {
  const dir = scriptsDir();
  const candidates: Array<{ path: string; includeFailed: boolean }> = [];

  if (existsSync(dir)) {
    const stamped = readdirSync(dir)
      .filter((name) => /^debug-amazon-buybox-check-.+\.out\.json$/i.test(name))
      .map((name) => join(dir, name));
    for (const path of stamped) {
      candidates.push({ path, includeFailed: true });
    }
  }

  const latestPointer = join(dir, "debug-amazon-buybox-check.latest.json");
  candidates.push({ path: latestPointer, includeFailed: true });
  candidates.push({
    path: join(dir, "debug-post-10p-buybox-check.out.json"),
    includeFailed: false,
  });
  candidates.push({
    path: join(dir, "amazon-buybox-watch-seed.json"),
    includeFailed: false,
  });

  let best: {
    path: string;
    seeds: BuyBoxMonitorSeedRow[];
    pulledAt: number;
  } | null = null;

  for (const candidate of candidates) {
    const data = tryReadJson(candidate.path);
    const seeds = seedsFromSweep(data, {
      includeFailed: candidate.includeFailed,
    });
    if (!seeds.length) continue;
    const pulledAt = Date.parse(data?.pulledAt ?? "") || 0;
    if (!best || pulledAt >= best.pulledAt) {
      best = { path: candidate.path, seeds, pulledAt };
    }
  }

  if (!best) {
    return { seeds: [], sourceFile: null };
  }
  return { seeds: best.seeds, sourceFile: best.path };
}

function writeOutputFiles(payload: BuyBoxMonitorPayload): string | null {
  const stamp = payload.pulledAt.replace(/[:.]/g, "-");
  const fileName = `debug-amazon-buybox-check-${stamp}.out.json`;
  const body = JSON.stringify(payload, null, 2);

  const locations = [
    join(scriptsDir(), fileName),
    join("/tmp", fileName),
  ];

  for (const filePath of locations) {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, body);
      // Keep a stable pointer for the next cron (lost + failed become the watch list).
      try {
        writeFileSync(
          join(dir, "debug-amazon-buybox-check.latest.json"),
          body,
        );
      } catch {
        // Pointer is best-effort.
      }
      return filePath;
    } catch {
      // Try next location (Vercel scripts/ is often read-only).
    }
  }
  return null;
}

async function checkOneSku(
  seed: BuyBoxMonitorSeedRow,
  ourSellerId: string,
): Promise<BuyBoxMonitorRow> {
  const base = {
    sku: seed.sku.trim(),
    fromPrice: seed.fromPrice ?? null,
    toPrice: seed.toPrice ?? null,
    rivalAtChange: seed.rivalAtChange ?? null,
  };

  try {
    const data = await fetchListingOffersForCustomerType(base.sku, "Consumer");
    const offers = data.payload?.Offers ?? [];
    const summary = data.payload?.Summary;
    const ourOffers = ourSellerId
      ? offers.filter((o) => o.SellerId === ourSellerId)
      : [];
    const winners = offers.filter((o) => o.IsBuyBoxWinner);
    const weWin = ourOffers.some((o) => o.IsBuyBoxWinner === true);
    const rivalWinner = winners.find((o) => o.SellerId !== ourSellerId) ?? null;
    const ourPrice =
      ourOffers[0]?.ListingPrice?.Amount != null
        ? Number(ourOffers[0].ListingPrice.Amount)
        : null;
    const buyBoxPrice =
      summary?.BuyBoxPrices?.[0]?.ListingPrice?.Amount != null
        ? Number(summary.BuyBoxPrices[0].ListingPrice.Amount)
        : winners[0]?.ListingPrice?.Amount != null
          ? Number(winners[0].ListingPrice.Amount)
          : null;

    return {
      ...base,
      liveOurPrice: ourPrice,
      liveBuyBoxPrice: buyBoxPrice,
      weWinBuyBox: weWin,
      rivalSellerId: rivalWinner?.SellerId ?? null,
      rivalPrice:
        rivalWinner?.ListingPrice?.Amount != null
          ? Number(rivalWinner.ListingPrice.Amount)
          : weWin
            ? null
            : buyBoxPrice,
      offerCount: offers.length,
    };
  } catch (error) {
    return {
      ...base,
      weWinBuyBox: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Monitoring-only Buy Box recheck for SKUs that lost (or previously 429'd)
 * in the most recent sweep. Never updates prices or rules.
 */
export async function runAmazonBuyBoxMonitor(): Promise<BuyBoxMonitorPayload> {
  const { seeds, sourceFile } = loadBuyBoxWatchSeeds();
  const ourSellerId = await resolveAmazonSellerId(
    seeds[0]?.sku?.trim() || undefined,
  );

  const rows: BuyBoxMonitorRow[] = [];

  for (let i = 0; i < seeds.length; i += BATCH_SIZE) {
    const batch = seeds.slice(i, i + BATCH_SIZE);
    for (const seed of batch) {
      rows.push(await checkOneSku(seed, ourSellerId));
      await sleep(PAUSE_BETWEEN_SKUS_MS);
    }
    if (i + BATCH_SIZE < seeds.length) {
      await sleep(PAUSE_BETWEEN_BATCHES_MS);
    }
  }

  const won = rows.filter((r) => r.weWinBuyBox === true);
  const lost = rows.filter((r) => r.weWinBuyBox === false);
  const failed = rows.filter((r) => r.weWinBuyBox == null);

  const payload: BuyBoxMonitorPayload = {
    pulledAt: new Date().toISOString(),
    sourceFile,
    ourSellerId,
    checkedCount: rows.length,
    wonCount: won.length,
    lostCount: lost.length,
    failedCount: failed.length,
    outputFile: null,
    won,
    lost,
    failed,
    rows,
  };

  payload.outputFile = writeOutputFiles(payload);
  return payload;
}
