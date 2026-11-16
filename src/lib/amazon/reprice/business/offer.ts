import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { parseQuantityDiscountPlan } from "@/lib/amazon/reprice/shared/quantity-plan";
import { resolveAmazonSellerId } from "@/lib/amazon/reprice/shared/seller-id";
import type { QuantityDiscountPlan } from "@/lib/amazon/reprice/shared/types";
import { getStandardCompetitiveSnapshot } from "@/lib/amazon/reprice/standard/competitive";

type OfferMoneySchedule = {
  schedule?: Array<{ value_with_tax?: number | string }>;
};

type PurchasableOffer = {
  audience?: string;
  marketplace_id?: string;
  currency?: string;
  our_price?: OfferMoneySchedule[];
  quantity_discount_plan?: unknown;
};

type ListingsItemAttributes = {
  attributes?: {
    purchasable_offer?: PurchasableOffer[];
  };
};

export type AmazonBusinessOffer = {
  sku: string;
  businessPrice: number | null;
  quantityDiscountPlan: QuantityDiscountPlan | null;
};

function ourPriceFromOffer(offer: PurchasableOffer | undefined): number | null {
  const raw = offer?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
  const amount = typeof raw === "string" ? Number(raw) : raw;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : null;
}

function amazonPlanToApp(plan: unknown): QuantityDiscountPlan | null {
  if (!plan) return null;
  if (Array.isArray(plan)) {
    const schedule = (plan[0] as { schedule?: unknown[] } | undefined)
      ?.schedule?.[0] as
      | {
          discount_type?: string;
          levels?: Array<{ lower_bound?: number; value?: number }>;
        }
      | undefined;
    if (!schedule) return null;
    return parseQuantityDiscountPlan({
      discountType: schedule.discount_type,
      levels: (schedule.levels ?? []).map((level) => ({
        lowerBound: level.lower_bound,
        value: level.value,
      })),
    });
  }
  return parseQuantityDiscountPlan(plan);
}

async function resolveSeller(seedSku: string): Promise<string> {
  return resolveAmazonSellerId(seedSku, async (seed) => {
    const snap = await getStandardCompetitiveSnapshot(seed, null, {
      bypassCache: true,
    });
    return snap?.sellerIdGuess ?? null;
  });
}

/** Read current Amazon Business (B2B) offer from Listings Items attributes. */
export async function fetchBusinessOffer(
  sku: string,
  seedSkuForSellerId?: string,
): Promise<AmazonBusinessOffer> {
  const { marketplaceId } = getAmazonConfig();
  const sellerId = await resolveSeller(seedSkuForSellerId || sku);
  const item = await amazonFetch<ListingsItemAttributes>({
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}`,
    query: {
      marketplaceIds: marketplaceId,
      includedData: "attributes",
    },
  });

  const offers = item.attributes?.purchasable_offer ?? [];
  const business =
    offers.find((offer) => (offer.audience || "").toUpperCase() === "B2B") ??
    null;

  return {
    sku,
    businessPrice: ourPriceFromOffer(business ?? undefined),
    quantityDiscountPlan: amazonPlanToApp(business?.quantity_discount_plan),
  };
}

export async function fetchBusinessOffersBatch(
  skus: string[],
): Promise<Map<string, AmazonBusinessOffer>> {
  const map = new Map<string, AmazonBusinessOffer>();
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  if (unique.length === 0) return map;

  let sellerSeed = unique[0]!;
  for (const sku of unique) {
    try {
      const offer = await fetchBusinessOffer(sku, sellerSeed);
      map.set(sku, offer);
      sellerSeed = sku;
    } catch {
      map.set(sku, {
        sku,
        businessPrice: null,
        quantityDiscountPlan: null,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return map;
}
