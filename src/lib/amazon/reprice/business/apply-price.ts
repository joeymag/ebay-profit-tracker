import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { quantityDiscountPlanToAmazonPatch } from "@/lib/amazon/reprice/shared/quantity-plan";
import { logRepriceEventForChannel } from "@/lib/amazon/reprice/shared/rules-store";
import { resolveAmazonSellerId } from "@/lib/amazon/reprice/shared/seller-id";
import { roundMoney } from "@/lib/amazon/reprice/shared/suggest";
import type { QuantityDiscountPlan } from "@/lib/amazon/reprice/shared/types";
import { getStandardCompetitiveSnapshot } from "@/lib/amazon/reprice/standard/competitive";

export async function updateBusinessListingPrice(input: {
  sku: string;
  price: number;
  quantityDiscountPlan?: QuantityDiscountPlan | null;
  seedSkuForSellerId?: string;
  fromPrice?: number | null;
  reason?: string | null;
  source?: string;
}): Promise<{ sku: string; price: number; channel: "business"; status: string }> {
  const price = roundMoney(input.price);
  if (!(price > 0)) {
    throw new Error("Price must be greater than zero.");
  }

  const { marketplaceId } = getAmazonConfig();
  const sellerId = await resolveAmazonSellerId(
    input.seedSkuForSellerId || input.sku,
    async (seed) => {
      const snap = await getStandardCompetitiveSnapshot(seed, null, {
        bypassCache: true,
      });
      return snap?.sellerIdGuess ?? null;
    },
  );

  const offerValue: Record<string, unknown> = {
    marketplace_id: marketplaceId,
    currency: "GBP",
    audience: "B2B",
    our_price: [{ schedule: [{ value_with_tax: price }] }],
  };

  const tierPatch = quantityDiscountPlanToAmazonPatch(input.quantityDiscountPlan);
  if (tierPatch) {
    offerValue.quantity_discount_plan = tierPatch;
  }

  const result = await amazonFetch<{ status?: string; sku?: string }>({
    method: "PATCH",
    path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(input.sku)}`,
    query: { marketplaceIds: marketplaceId },
    body: {
      productType: "PRODUCT",
      patches: [
        {
          op: "merge",
          path: "/attributes/purchasable_offer",
          value: [offerValue],
        },
      ],
    },
  });

  const status = result.status || "ACCEPTED";
  await logRepriceEventForChannel({
    sku: input.sku,
    channel: "business",
    fromPrice: input.fromPrice,
    toPrice: price,
    source: input.source ?? "manual",
    reason: input.reason,
    status: "applied",
  });

  return { sku: input.sku, price, channel: "business", status };
}
