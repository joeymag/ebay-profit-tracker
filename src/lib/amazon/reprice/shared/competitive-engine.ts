import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  rememberSellerId,
  resolveStoredSellerId,
} from "@/lib/amazon/reprice/shared/seller-id";
import type {
  AmazonCompetitiveSnapshot,
  AmazonRepriceChannel,
} from "@/lib/amazon/reprice/shared/types";
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

export type ListingOffersResponse = {
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

export const COMPETITIVE_CACHE_TTL_MS = 20 * 60_000;

function moneyAmount(value: Money | undefined): number | null {
  const n = value?.Amount;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function snapshotFromOffers(
  sku: string,
  channel: AmazonRepriceChannel,
  data: ListingOffersResponse,
  yourListedPrice: number | null | undefined,
  storedSellerId: string | null,
): AmazonCompetitiveSnapshot {
  const summary = data.payload?.Summary;
  const offers = data.payload?.Offers ?? [];

  const buyBoxPrice =
    moneyAmount(summary?.BuyBoxPrices?.[0]?.LandedPrice) ??
    moneyAmount(summary?.BuyBoxPrices?.[0]?.ListingPrice) ??
    moneyAmount(offers.find((o) => o.IsBuyBoxWinner)?.ListingPrice);

  const lowestPrice =
    moneyAmount(summary?.LowestPrices?.[0]?.LandedPrice) ??
    moneyAmount(summary?.LowestPrices?.[0]?.ListingPrice) ??
    offers.reduce<number | null>((min, offer) => {
      const amount = moneyAmount(offer.ListingPrice);
      if (amount == null) return min;
      return min == null ? amount : Math.min(min, amount);
    }, null);

  const ourOffers = storedSellerId
    ? offers.filter((o) => o.SellerId === storedSellerId)
    : [];

  let yourOffer: Offer | undefined =
    ourOffers.find((o) => o.IsBuyBoxWinner) ?? ourOffers[0];

  if (!yourOffer && yourListedPrice != null) {
    const atOurPrice = offers.filter((o) => {
      const amount = moneyAmount(o.ListingPrice);
      return amount != null && Math.abs(amount - yourListedPrice) < 0.015;
    });
    yourOffer =
      (storedSellerId
        ? atOurPrice.find((o) => o.SellerId === storedSellerId)
        : undefined) ??
      atOurPrice.find((o) => o.IsBuyBoxWinner) ??
      atOurPrice[0];
  }

  const buyBoxWinner = offers.find((o) => o.IsBuyBoxWinner);
  const weAreMarkedWinner = ourOffers.some((o) => o.IsBuyBoxWinner === true);
  const winnerIsUs = Boolean(
    storedSellerId && buyBoxWinner?.SellerId === storedSellerId,
  );

  const offerCount = summary?.TotalOfferCount ?? offers.length;
  let youHaveBuyBox: boolean | null = null;
  if (weAreMarkedWinner || winnerIsUs) {
    youHaveBuyBox = true;
  } else if (ourOffers.length > 0) {
    youHaveBuyBox = false;
  } else if (
    yourOffer &&
    storedSellerId &&
    yourOffer.SellerId === storedSellerId
  ) {
    youHaveBuyBox = Boolean(yourOffer.IsBuyBoxWinner);
  } else if (yourOffer && !storedSellerId) {
    youHaveBuyBox = yourOffer.IsBuyBoxWinner === true;
  } else if (offerCount <= 1 && buyBoxPrice != null && offers.length <= 1) {
    youHaveBuyBox = true;
  }

  return {
    sku,
    channel,
    buyBoxPrice,
    lowestPrice,
    offerCount,
    yourOfferPrice:
      moneyAmount(yourOffer?.ListingPrice) ??
      (typeof yourListedPrice === "number" ? yourListedPrice : null),
    youHaveBuyBox,
    sellerIdGuess:
      yourOffer?.SellerId?.trim() ||
      ourOffers[0]?.SellerId?.trim() ||
      storedSellerId,
  };
}

export async function readCompetitiveCache(
  skus: string[],
  channel: AmazonRepriceChannel,
): Promise<Map<string, AmazonCompetitiveSnapshot>> {
  const map = new Map<string, AmazonCompetitiveSnapshot>();
  if (!isSupabaseConfigured() || skus.length === 0) return map;
  try {
    const supabase = createSupabaseAdmin();
    const cutoff = new Date(Date.now() - COMPETITIVE_CACHE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("amazon_competitive_cache")
      .select("sku, channel, snapshot, fetched_at")
      .eq("channel", channel)
      .in("sku", skus)
      .gte("fetched_at", cutoff);
    if (error || !data) return map;
    for (const row of data) {
      const snap = row.snapshot as AmazonCompetitiveSnapshot | null;
      if (snap && typeof snap === "object") {
        map.set(row.sku, { ...snap, sku: row.sku, channel });
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
        channel: snapshot.channel,
        snapshot,
        fetched_at: now,
      })),
      { onConflict: "sku,channel" },
    );
  } catch {
    // Ignore cache write failures.
  }
}

export async function fetchListingOffersForCustomerType(
  sku: string,
  customerType: "Consumer" | "Business",
): Promise<ListingOffersResponse> {
  const { marketplaceId } = getAmazonConfig();
  return amazonFetch<ListingOffersResponse>({
    path: `/products/pricing/v0/listings/${encodeURIComponent(sku)}/offers`,
    query: {
      MarketplaceId: marketplaceId,
      ItemCondition: "New",
      CustomerType: customerType,
    },
  });
}

export async function fetchListingOffersBatchForCustomerType(
  skus: string[],
  customerType: "Consumer" | "Business",
): Promise<Map<string, ListingOffersResponse | null>> {
  const map = new Map<string, ListingOffersResponse | null>();
  if (skus.length === 0) return map;

  const { marketplaceId } = getAmazonConfig();
  const data = await amazonFetch<{
    responses?: Array<{
      status?: { statusCode?: number };
      body?: ListingOffersResponse;
    }>;
  }>({
    method: "POST",
    path: "/batches/products/pricing/v0/listingOffers",
    body: {
      requests: skus.map((sku) => ({
        uri: `/products/pricing/v0/listings/${encodeURIComponent(sku)}/offers`,
        method: "GET",
        MarketplaceId: marketplaceId,
        ItemCondition: "New",
        CustomerType: customerType,
      })),
    },
  });

  const responses = data.responses ?? [];
  skus.forEach((sku, index) => {
    const response = responses[index];
    const status = response?.status?.statusCode ?? 0;
    map.set(
      sku,
      status >= 200 && status < 300 && response?.body ? response.body : null,
    );
  });
  return map;
}

export async function loadCompetitiveSnapshots(input: {
  channel: AmazonRepriceChannel;
  customerType: "Consumer" | "Business";
  skus: string[];
  priceBySku?: Map<string, number | null>;
  bypassCache?: boolean;
  /** When true, empty offer payloads become null (Business). */
  rejectEmptyOffers?: boolean;
}): Promise<Map<string, AmazonCompetitiveSnapshot | null>> {
  const result = new Map<string, AmazonCompetitiveSnapshot | null>();
  const unique = [...new Set(input.skus.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const cached = input.bypassCache
    ? new Map<string, AmazonCompetitiveSnapshot>()
    : await readCompetitiveCache(unique, input.channel);
  const missing: string[] = [];
  for (const sku of unique) {
    const hit = cached.get(sku);
    if (hit) result.set(sku, hit);
    else missing.push(sku);
  }

  const storedSellerId = await resolveStoredSellerId();
  const fresh: AmazonCompetitiveSnapshot[] = [];

  for (let i = 0; i < missing.length; i += 20) {
    const chunk = missing.slice(i, i + 20);
    let offersBySku = new Map<string, ListingOffersResponse | null>();
    try {
      offersBySku = await fetchListingOffersBatchForCustomerType(
        chunk,
        input.customerType,
      );
    } catch {
      offersBySku = new Map(chunk.map((sku) => [sku, null]));
    }
    for (const sku of chunk) {
      const data = offersBySku.get(sku);
      if (!data) {
        result.set(sku, null);
        continue;
      }
      const snapshot = snapshotFromOffers(
        sku,
        input.channel,
        data,
        input.priceBySku?.get(sku) ?? null,
        storedSellerId,
      );
      if (
        input.rejectEmptyOffers &&
        snapshot.buyBoxPrice == null &&
        snapshot.lowestPrice == null &&
        snapshot.offerCount === 0
      ) {
        result.set(sku, null);
        continue;
      }
      result.set(sku, snapshot);
      fresh.push(snapshot);
    }
  }

  if (fresh.length > 0) {
    const guess = fresh.find((s) => s.sellerIdGuess)?.sellerIdGuess;
    if (guess && !storedSellerId) {
      await rememberSellerId(guess);
    }
    await writeCompetitiveCache(fresh);
  }

  return result;
}

export async function loadCompetitiveSnapshot(input: {
  channel: AmazonRepriceChannel;
  customerType: "Consumer" | "Business";
  sku: string;
  yourListedPrice?: number | null;
  bypassCache?: boolean;
  rejectEmptyOffers?: boolean;
}): Promise<AmazonCompetitiveSnapshot | null> {
  const map = await loadCompetitiveSnapshots({
    channel: input.channel,
    customerType: input.customerType,
    skus: [input.sku],
    priceBySku: new Map([[input.sku, input.yourListedPrice ?? null]]),
    bypassCache: input.bypassCache,
    rejectEmptyOffers: input.rejectEmptyOffers,
  });
  return map.get(input.sku) ?? null;
}
