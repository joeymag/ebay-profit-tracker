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
  sellerIdOverride?: string,
): Promise<AmazonBusinessOffer> {
  const { marketplaceId } = getAmazonConfig();
  const sellerId =
    sellerIdOverride ?? (await resolveSeller(seedSkuForSellerId || sku));
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

/**
 * Fetch Business offers for many SKUs with limited concurrency.
 * Listings Items has no multi-SKU GET batch; we parallelize carefully.
 */
export async function fetchBusinessOffersBatch(
  skus: string[],
  options?: { concurrency?: number },
): Promise<Map<string, AmazonBusinessOffer>> {
  const map = new Map<string, AmazonBusinessOffer>();
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  if (unique.length === 0) return map;

  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 5, 8));
  const sellerId = await resolveSeller(unique[0]!);

  let cursor = 0;
  async function worker() {
    while (cursor < unique.length) {
      const index = cursor;
      cursor += 1;
      const sku = unique[index]!;
      try {
        const offer = await fetchBusinessOffer(sku, sku, sellerId);
        map.set(sku, offer);
      } catch {
        map.set(sku, {
          sku,
          businessPrice: null,
          quantityDiscountPlan: null,
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()),
  );
  return map;
}
