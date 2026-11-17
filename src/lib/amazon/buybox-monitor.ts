import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

import { fetchAmazonListings } from "@/lib/amazon/listings";
import { listStoredAmazonListings } from "@/lib/amazon/listings-store";
import {
  fetchListingOffersBatchForCustomerType,
  type ListingOffersResponse,
  snapshotFromOffers,
} from "@/lib/amazon/reprice/shared/competitive-engine";
import { resolveAmazonSellerId } from "@/lib/amazon/reprice/shared/seller-id";
import { getStandardCompetitiveSnapshot } from "@/lib/amazon/reprice/standard/competitive";
import type { AmazonCompetitiveSnapshot } from "@/lib/amazon/reprice/shared/types";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Offers batch size (SP-API listingOffers batch). */
const OFFERS_BATCH_SIZE = 20;
const PAUSE_BETWEEN_OFFER_BATCHES_MS = 2500;

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
  /** Same ownership heuristics as competitive-engine.snapshotFromOffers. */
  weWinBuyBox: boolean | null;
  rivalSellerId?: string | null;
  rivalPrice?: number | null;
  offerCount?: number;
  /** Reused by Buy Box → reprice handoff to avoid a second offers fetch. */
  competitive?: AmazonCompetitiveSnapshot | null;
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

export type LoadBuyBoxSeedsOptions = {
  /**
   * When reading prior sweep/watch files, include failed SKUs.
   * Default true so 429s get another look.
   */
  includeFailed?: boolean;
};

function scriptsDir(): string {
  return join(process.cwd(), "scripts");
}

/** Durable local directory for watch output (preferred over /tmp). */
function dataBuyBoxDir(): string {
  return join(process.cwd(), "data", "amazon-buybox");
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

/** Prefer lost SKUs; optionally keep prior failures so they get another look. */
function seedsFromSweep(
  data: SweepFileShape | null,
  options?: { includeFailed?: boolean },
): BuyBoxMonitorSeedRow[] {
  if (!data) return [];
  const includeFailed = options?.includeFailed !== false;
  const bySku = new Map<string, BuyBoxMonitorSeedRow>();
  for (const row of data.lost ?? []) {
    if (row?.sku?.trim()) bySku.set(seedKey(row), row);
  }
  if (includeFailed) {
    for (const row of data.failed ?? []) {
      if (row?.sku?.trim() && !bySku.has(seedKey(row))) {
        bySku.set(seedKey(row), row);
      }
    }
  }
  return [...bySku.values()];
}

async function readLatestWatchFromSupabase(): Promise<SweepFileShape | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase
      .from("amazon_buybox_watch_latest")
      .select("payload")
      .eq("id", "latest")
      .maybeSingle();
    if (error || !data?.payload) return null;
    return data.payload as SweepFileShape;
  } catch {
    return null;
  }
}

async function writeLatestWatchToSupabase(
  payload: BuyBoxMonitorPayload,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const forStore = {
      pulledAt: payload.pulledAt,
      lost: payload.lost.map(({ competitive: _c, ...rest }) => rest),
      failed: payload.failed.map(({ competitive: _c, ...rest }) => rest),
      wonCount: payload.wonCount,
      lostCount: payload.lostCount,
      failedCount: payload.failedCount,
      checkedCount: payload.checkedCount,
    };
    const supabase = createSupabaseAdmin();
    await supabase.from("amazon_buybox_watch_latest").upsert(
      {
        id: "latest",
        payload: forStore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (error) {
    console.warn(
      "[buybox-monitor] failed to persist watch latest to Supabase:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Load seeds for the Buy Box checker.
 * Primary source: full Amazon listings catalog (DB, then fast listings cache).
 * Prior sweep files enrich prices / failed retries when present.
 */
export async function loadBuyBoxMonitorSeeds(
  options?: LoadBuyBoxSeedsOptions,
): Promise<{
  seeds: BuyBoxMonitorSeedRow[];
  sourceFile: string | null;
}> {
  const includeFailed = options?.includeFailed !== false;
  const bySku = new Map<string, BuyBoxMonitorSeedRow>();

  // --- Full catalog ---
  let catalogSource: string | null = null;
  try {
    const stored = await listStoredAmazonListings();
    if (stored.length > 0) {
      catalogSource = "amazon_listings";
      for (const row of stored) {
        const sku = row.sku?.trim();
        if (!sku) continue;
        bySku.set(sku, {
          sku,
          fromPrice: row.price == null ? null : Number(row.price),
          toPrice: row.price == null ? null : Number(row.price),
        });
      }
    }
  } catch (error) {
    console.warn(
      "[buybox-monitor] amazon_listings read failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (bySku.size === 0) {
    try {
      const listings = await fetchAmazonListings({ fast: true });
      catalogSource = "amazon_listings_cache";
      for (const listing of listings.listings ?? []) {
        const sku = listing.sku?.trim();
        if (!sku) continue;
        bySku.set(sku, {
          sku,
          fromPrice: listing.price,
          toPrice: listing.price,
        });
      }
    } catch (error) {
      console.warn(
        "[buybox-monitor] listings cache read failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // --- Enrich / fall back from prior watch + JSON seeds ---
  const dataDir = dataBuyBoxDir();
  const scripts = scriptsDir();
  const fileCandidates: string[] = [];

  if (existsSync(dataDir)) {
    for (const name of readdirSync(dataDir)) {
      if (/^debug-amazon-buybox-check-.+\.out\.json$/i.test(name)) {
        fileCandidates.push(join(dataDir, name));
      }
    }
    fileCandidates.push(join(dataDir, "debug-amazon-buybox-check.latest.json"));
  }
  if (existsSync(scripts)) {
    for (const name of readdirSync(scripts)) {
      if (/^debug-amazon-buybox-check-.+\.out\.json$/i.test(name)) {
        fileCandidates.push(join(scripts, name));
      }
    }
    fileCandidates.push(join(scripts, "debug-amazon-buybox-check.latest.json"));
    fileCandidates.push(join(scripts, "debug-post-10p-buybox-check.out.json"));
    fileCandidates.push(join(scripts, "amazon-buybox-watch-seed.json"));
  }

  let bestSweep: { path: string; seeds: BuyBoxMonitorSeedRow[]; pulledAt: number } | null =
    null;

  const supabaseSweep = await readLatestWatchFromSupabase();
  if (supabaseSweep) {
    const seeds = seedsFromSweep(supabaseSweep, { includeFailed });
    if (seeds.length) {
      bestSweep = {
        path: "supabase:amazon_buybox_watch_latest",
        seeds,
        pulledAt: Date.parse(supabaseSweep.pulledAt ?? "") || 0,
      };
    }
  }

  for (const path of fileCandidates) {
    const data = tryReadJson(path);
    const seeds = seedsFromSweep(data, { includeFailed });
    if (!seeds.length) continue;
    const pulledAt = Date.parse(data?.pulledAt ?? "") || 0;
    if (!bestSweep || pulledAt >= bestSweep.pulledAt) {
      bestSweep = { path, seeds, pulledAt };
    }
  }

  if (bestSweep) {
    for (const seed of bestSweep.seeds) {
      const sku = seedKey(seed);
      const existing = bySku.get(sku);
      if (existing) {
        bySku.set(sku, {
          ...existing,
          fromPrice: seed.fromPrice ?? existing.fromPrice,
          toPrice: seed.toPrice ?? existing.toPrice,
          rivalAtChange: seed.rivalAtChange ?? existing.rivalAtChange,
        });
      } else if (bySku.size === 0) {
        // Catalog empty — use sweep as the seed list.
        bySku.set(sku, seed);
      } else {
        // Catalog present: still include prior failures not in catalog (edge).
        bySku.set(sku, seed);
      }
    }
  }

  const seeds = [...bySku.values()].sort((a, b) =>
    a.sku.localeCompare(b.sku, undefined, { numeric: true }),
  );

  const sourceFile =
    catalogSource && bestSweep
      ? `${catalogSource}+${bestSweep.path}`
      : catalogSource ?? bestSweep?.path ?? null;

  return { seeds, sourceFile };
}

/** @deprecated Use loadBuyBoxMonitorSeeds — sync JSON-only loader kept for scripts. */
export function loadBuyBoxWatchSeeds(options?: LoadBuyBoxSeedsOptions): {
  seeds: BuyBoxMonitorSeedRow[];
  sourceFile: string | null;
} {
  const includeFailed = options?.includeFailed !== false;
  const dir = scriptsDir();
  const dataDir = dataBuyBoxDir();
  const candidates: string[] = [];

  for (const base of [dataDir, dir]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      if (/^debug-amazon-buybox-check-.+\.out\.json$/i.test(name)) {
        candidates.push(join(base, name));
      }
    }
    candidates.push(join(base, "debug-amazon-buybox-check.latest.json"));
  }
  candidates.push(join(dir, "debug-post-10p-buybox-check.out.json"));
  candidates.push(join(dir, "amazon-buybox-watch-seed.json"));

  let best: { path: string; seeds: BuyBoxMonitorSeedRow[]; pulledAt: number } | null =
    null;
  for (const path of candidates) {
    const data = tryReadJson(path);
    const seeds = seedsFromSweep(data, { includeFailed });
    if (!seeds.length) continue;
    const pulledAt = Date.parse(data?.pulledAt ?? "") || 0;
    if (!best || pulledAt >= best.pulledAt) {
      best = { path, seeds, pulledAt };
    }
  }
  if (!best) return { seeds: [], sourceFile: null };
  return { seeds: best.seeds, sourceFile: best.path };
}

function writeOutputFiles(payload: BuyBoxMonitorPayload): string | null {
  const stamp = payload.pulledAt.replace(/[:.]/g, "-");
  const fileName = `debug-amazon-buybox-check-${stamp}.out.json`;
  const forDisk = {
    ...payload,
    won: payload.won.map(({ competitive: _c, ...rest }) => rest),
    lost: payload.lost.map(({ competitive: _c, ...rest }) => rest),
    failed: payload.failed.map(({ competitive: _c, ...rest }) => rest),
    rows: payload.rows.map(({ competitive: _c, ...rest }) => rest),
  };
  const body = JSON.stringify(forDisk, null, 2);

  // Prefer durable project data dir, then scripts/. Avoid /tmp as primary.
  const locations = [
    join(dataBuyBoxDir(), fileName),
    join(scriptsDir(), fileName),
  ];

  for (const filePath of locations) {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, body);
      try {
        writeFileSync(join(dir, "debug-amazon-buybox-check.latest.json"), body);
      } catch {
        // Pointer is best-effort.
      }
      return filePath;
    } catch {
      // Try next location (Vercel project dirs are often read-only).
    }
  }
  return null;
}

function rowFromOffers(
  seed: BuyBoxMonitorSeedRow,
  data: ListingOffersResponse | null,
  ourSellerId: string,
  error?: string,
): BuyBoxMonitorRow {
  const base = {
    sku: seed.sku.trim(),
    fromPrice: seed.fromPrice ?? null,
    toPrice: seed.toPrice ?? null,
    rivalAtChange: seed.rivalAtChange ?? null,
  };

  if (!data) {
    return {
      ...base,
      weWinBuyBox: null,
      competitive: null,
      error: error || "No offers response.",
    };
  }

  const listedPrice = seed.toPrice ?? seed.fromPrice ?? null;
  const competitive = snapshotFromOffers(
    base.sku,
    "standard",
    data,
    listedPrice,
    ourSellerId,
  );
  const offers = data.payload?.Offers ?? [];
  const winners = offers.filter((o) => o.IsBuyBoxWinner);
  const rivalWinner = winners.find((o) => o.SellerId !== ourSellerId) ?? null;

  return {
    ...base,
    liveOurPrice: competitive.yourOfferPrice,
    liveBuyBoxPrice: competitive.buyBoxPrice,
    weWinBuyBox: competitive.youHaveBuyBox,
    rivalSellerId: rivalWinner?.SellerId ?? null,
    rivalPrice:
      rivalWinner?.ListingPrice?.Amount != null
        ? Number(rivalWinner.ListingPrice.Amount)
        : competitive.youHaveBuyBox
          ? null
          : competitive.buyBoxPrice,
    offerCount: competitive.offerCount,
    competitive,
  };
}

/**
 * Full-catalog Buy Box recheck. Price updates are handled by the cron handoff.
 */
export async function runAmazonBuyBoxMonitor(
  options?: LoadBuyBoxSeedsOptions,
): Promise<BuyBoxMonitorPayload> {
  const { seeds, sourceFile } = await loadBuyBoxMonitorSeeds(options);
  const ourSellerId = await resolveAmazonSellerId(
    seeds[0]?.sku?.trim() || undefined,
    async (seed) => {
      const snap = await getStandardCompetitiveSnapshot(seed, null, {
        bypassCache: true,
      });
      return snap?.sellerIdGuess ?? null;
    },
  );

  const seedBySku = new Map(seeds.map((seed) => [seed.sku.trim(), seed]));
  const rows: BuyBoxMonitorRow[] = [];

  for (let i = 0; i < seeds.length; i += OFFERS_BATCH_SIZE) {
    const chunk = seeds.slice(i, i + OFFERS_BATCH_SIZE);
    const skus = chunk.map((seed) => seed.sku.trim());
    let offersBySku = new Map<string, ListingOffersResponse | null>();
    try {
      offersBySku = await fetchListingOffersBatchForCustomerType(
        skus,
        "Consumer",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const seed of chunk) {
        rows.push(rowFromOffers(seed, null, ourSellerId, message));
      }
      if (i + OFFERS_BATCH_SIZE < seeds.length) {
        await sleep(PAUSE_BETWEEN_OFFER_BATCHES_MS);
      }
      continue;
    }

    for (const sku of skus) {
      const seed = seedBySku.get(sku)!;
      rows.push(rowFromOffers(seed, offersBySku.get(sku) ?? null, ourSellerId));
    }

    if (i + OFFERS_BATCH_SIZE < seeds.length) {
      await sleep(PAUSE_BETWEEN_OFFER_BATCHES_MS);
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
  await writeLatestWatchToSupabase(payload);
  return payload;
}
