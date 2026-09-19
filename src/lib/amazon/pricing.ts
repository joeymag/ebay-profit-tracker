import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  getStoredAmazonSellerId,
  saveAmazonSellerId,
} from "@/lib/amazon/token-store";
import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Money = { CurrencyCode?: string; Amount?: number };
type Offer = {
  SellerId?: string;
  IsBuyBoxWinner?: boolean;
  IsFulfilledByAmazon?: boolean;
  ListingPrice?: Money;
  Shipping?: Money;
  SubCondition?: string;
};

type ListingOffersResponse = {
  payload?: {
    SKU?: string;
    Summary?: {
      BuyBoxPrices?: Array<{
        condition?: string;
        ListingPrice?: Money;
        LandedPrice?: Money;
      }>;
      LowestPrices?: Array<{
        condition?: string;
        fulfillmentChannel?: string;
        ListingPrice?: Money;
        LandedPrice?: Money;
      }>;
      TotalOfferCount?: number;
    };
    Offers?: Offer[];
  };
};

export type AmazonCompetitiveSnapshot = {
  sku: string;
  buyBoxPrice: number | null;
  lowestPrice: number | null;
  offerCount: number;
  yourOfferPrice: number | null;
  youHaveBuyBox: boolean | null;
  sellerIdGuess: string | null;
};

/** Keep Buy Box snapshots briefly so the repricer page stays snappy. */
export const COMPETITIVE_CACHE_TTL_MS = 20 * 60_000;

let cachedSellerId: string | null | undefined;

function moneyAmount(value: Money | undefined): number | null {
  const n = value?.Amount;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

async function resolveStoredSellerId(): Promise<string | null> {
  if (cachedSellerId !== undefined) return cachedSellerId;
  cachedSellerId = await getStoredAmazonSellerId();
  return cachedSellerId;
}

export async function fetchListingOffers(sku: string) {
  const { marketplaceId } = getAmazonConfig();
  return amazonFetch<ListingOffersResponse>({
    path: `/products/pricing/v0/listings/${encodeURIComponent(sku)}/offers`,
    query: {
      MarketplaceId: marketplaceId,
      ItemCondition: "New",
    },
  });
}

function snapshotFromOffers(
  sku: string,
  data: ListingOffersResponse,
  yourListedPrice: number | null | undefined,
  storedSellerId: string | null,
): AmazonCompetitiveSnapshot {
  const summary = data.payload?.Summary;
  const offers = data.payload?.Offers ?? [];

  const buyBoxPrice =
    moneyAmount(summary?.BuyBoxPrices?.[0]?.ListingPrice) ??
    moneyAmount(offers.find((o) => o.IsBuyBoxWinner)?.ListingPrice);

  const lowestPrice =
    moneyAmount(summary?.LowestPrices?.[0]?.ListingPrice) ??
    offers.reduce<number | null>((min, offer) => {
      const amount = moneyAmount(offer.ListingPrice);
      if (amount == null) return min;
      return min == null ? amount : Math.min(min, amount);
    }, null);

  let yourOffer: Offer | undefined;
  if (storedSellerId) {
    yourOffer = offers.find((o) => o.SellerId === storedSellerId);
  }
  if (!yourOffer && yourListedPrice != null) {
    yourOffer = offers.find((o) => {
      const amount = moneyAmount(o.ListingPrice);
      return amount != null && Math.abs(amount - yourListedPrice) < 0.005;
    });
  }
  if (!yourOffer) {
    yourOffer = offers.find((o) => o.IsBuyBoxWinner);
  }

  return {
    sku,
    buyBoxPrice,
    lowestPrice,
    offerCount: summary?.TotalOfferCount ?? offers.length,
    yourOfferPrice: moneyAmount(yourOffer?.ListingPrice),
    youHaveBuyBox: yourOffer ? Boolean(yourOffer.IsBuyBoxWinner) : null,
    sellerIdGuess: yourOffer?.SellerId?.trim() || null,
  };
}

export async function readCompetitiveCache(
  skus: string[],
): Promise<Map<string, AmazonCompetitiveSnapshot>> {
  const map = new Map<string, AmazonCompetitiveSnapshot>();
  if (!isSupabaseConfigured() || skus.length === 0) return map;
  try {
    const supabase = createSupabaseAdmin();
    const cutoff = new Date(Date.now() - COMPETITIVE_CACHE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("amazon_competitive_cache")
      .select("sku, snapshot, fetched_at")
      .in("sku", skus)
      .gte("fetched_at", cutoff);
    if (error || !data) return map;
    for (const row of data) {
      const snap = row.snapshot as AmazonCompetitiveSnapshot | null;
      if (snap && typeof snap === "object") {
        map.set(row.sku, { ...snap, sku: row.sku });
      }
    }
  } catch {
    // Ignore cache read failures.
  }
  return map;
}

export async function writeCompetitiveCache(
  snapshots: AmazonCompetitiveSnapshot[],
): Promise<void> {
  if (!isSupabaseConfigured() || snapshots.length === 0) return;
  try {
    const supabase = createSupabaseAdmin();
    const now = new Date().toISOString();
    await supabase.from("amazon_competitive_cache").upsert(
      snapshots.map((snapshot) => ({
        sku: snapshot.sku,
        snapshot,
        fetched_at: now,
      })),
      { onConflict: "sku" },
    );
  } catch {
    // Ignore cache write failures.
  }
}

export async function getCompetitiveSnapshot(
  sku: string,
  yourListedPrice?: number | null,
  options?: { bypassCache?: boolean },
): Promise<AmazonCompetitiveSnapshot> {
  if (!options?.bypassCache) {
    const cached = await readCompetitiveCache([sku]);
    const hit = cached.get(sku);
    if (hit) return hit;
  }

  const data = await fetchListingOffers(sku);
  const storedSellerId = await resolveStoredSellerId();
  const snapshot = snapshotFromOffers(
    sku,
    data,
    yourListedPrice,
    storedSellerId,
  );

  if (snapshot.sellerIdGuess && !storedSellerId) {
    await saveAmazonSellerId(snapshot.sellerIdGuess);
    cachedSellerId = snapshot.sellerIdGuess;
  }

  await writeCompetitiveCache([snapshot]);
  return snapshot;
}

/**
 * Fetch competitive snapshots for many SKUs with cache + limited parallelism.
 */
export async function getCompetitiveSnapshotsBatch(input: {
  skus: string[];
  priceBySku?: Map<string, number | null>;
  concurrency?: number;
  bypassCache?: boolean;
}): Promise<Map<string, AmazonCompetitiveSnapshot | null>> {
  const result = new Map<string, AmazonCompetitiveSnapshot | null>();
  const unique = [...new Set(input.skus.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const cached = input.bypassCache
    ? new Map<string, AmazonCompetitiveSnapshot>()
    : await readCompetitiveCache(unique);
  const missing: string[] = [];
  for (const sku of unique) {
    const hit = cached.get(sku);
    if (hit) result.set(sku, hit);
    else missing.push(sku);
  }

  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 6));
  const storedSellerId = await resolveStoredSellerId();
  const fresh: AmazonCompetitiveSnapshot[] = [];

  for (let i = 0; i < missing.length; i += concurrency) {
    const chunk = missing.slice(i, i + concurrency);
    const parts = await Promise.all(
      chunk.map(async (sku) => {
        try {
          const data = await fetchListingOffers(sku);
          const snapshot = snapshotFromOffers(
            sku,
            data,
            input.priceBySku?.get(sku) ?? null,
            storedSellerId,
          );
          return snapshot;
        } catch {
          return null;
        }
      }),
    );
    for (let j = 0; j < chunk.length; j += 1) {
      const sku = chunk[j]!;
      const snap = parts[j] ?? null;
      result.set(sku, snap);
      if (snap) fresh.push(snap);
    }
  }

  if (fresh.length > 0) {
    const guess = fresh.find((s) => s.sellerIdGuess)?.sellerIdGuess;
    if (guess && !storedSellerId) {
      await saveAmazonSellerId(guess);
      cachedSellerId = guess;
    }
    await writeCompetitiveCache(fresh);
  }

  return result;
}

export async function resolveAmazonSellerId(seedSku?: string): Promise<string> {
  const fromEnv = process.env.AMAZON_SELLER_ID?.trim();
  if (fromEnv) return fromEnv;

  const stored = await resolveStoredSellerId();
  if (stored) return stored;

  if (!seedSku) {
    throw new Error(
      "Amazon seller ID unknown. Open Amazon Repricer once so it can detect it, or set AMAZON_SELLER_ID.",
    );
  }

  const snapshot = await getCompetitiveSnapshot(seedSku, null, {
    bypassCache: true,
  });
  if (!snapshot.sellerIdGuess) {
    throw new Error(
      "Could not detect Amazon seller ID from offers. Set AMAZON_SELLER_ID in env.",
    );
  }
  return snapshot.sellerIdGuess;
}
