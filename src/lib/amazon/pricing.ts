import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  getStoredAmazonSellerId,
  saveAmazonSellerId,
} from "@/lib/amazon/token-store";

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

function moneyAmount(value: Money | undefined): number | null {
  const n = value?.Amount;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
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

export async function getCompetitiveSnapshot(
  sku: string,
  yourListedPrice?: number | null,
): Promise<AmazonCompetitiveSnapshot> {
  const data = await fetchListingOffers(sku);
  const summary = data.payload?.Summary;
  const offers = data.payload?.Offers ?? [];

  const buyBoxPrice =
    moneyAmount(summary?.BuyBoxPrices?.[0]?.ListingPrice) ??
    moneyAmount(
      offers.find((o) => o.IsBuyBoxWinner)?.ListingPrice,
    );

  const lowestPrice =
    moneyAmount(summary?.LowestPrices?.[0]?.ListingPrice) ??
    offers.reduce<number | null>((min, offer) => {
      const amount = moneyAmount(offer.ListingPrice);
      if (amount == null) return min;
      return min == null ? amount : Math.min(min, amount);
    }, null);

  const storedSellerId = await getStoredAmazonSellerId();
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

  const sellerIdGuess = yourOffer?.SellerId?.trim() || null;
  if (sellerIdGuess && !storedSellerId) {
    await saveAmazonSellerId(sellerIdGuess);
  }

  return {
    sku,
    buyBoxPrice,
    lowestPrice,
    offerCount: summary?.TotalOfferCount ?? offers.length,
    yourOfferPrice: moneyAmount(yourOffer?.ListingPrice),
    youHaveBuyBox: yourOffer ? Boolean(yourOffer.IsBuyBoxWinner) : null,
    sellerIdGuess,
  };
}

export async function resolveAmazonSellerId(seedSku?: string): Promise<string> {
  const fromEnv = process.env.AMAZON_SELLER_ID?.trim();
  if (fromEnv) return fromEnv;

  const stored = await getStoredAmazonSellerId();
  if (stored) return stored;

  if (!seedSku) {
    throw new Error(
      "Amazon seller ID unknown. Open Amazon Repricer once so it can detect it, or set AMAZON_SELLER_ID.",
    );
  }

  const snapshot = await getCompetitiveSnapshot(seedSku);
  if (!snapshot.sellerIdGuess) {
    throw new Error(
      "Could not detect Amazon seller ID from offers. Set AMAZON_SELLER_ID in env.",
    );
  }
  return snapshot.sellerIdGuess;
}
