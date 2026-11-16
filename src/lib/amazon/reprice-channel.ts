/**
 * Compatibility façade — types/helpers live under `@/lib/amazon/reprice/shared`.
 */
export type { AmazonRepriceChannel, QuantityDiscountPlan, QuantityDiscountLevel } from "@/lib/amazon/reprice/shared/types";
export {
  parseQuantityDiscountPlan,
  quantityDiscountPlanToJson,
  quantityDiscountPlanToAmazonPatch,
} from "@/lib/amazon/reprice/shared/quantity-plan";

import type { AmazonRepriceChannel } from "@/lib/amazon/reprice/shared/types";

export function parseRepriceChannel(
  value: unknown,
): AmazonRepriceChannel | null {
  if (value === "standard" || value === "business") return value;
  return null;
}

export function repriceAudience(
  channel: AmazonRepriceChannel,
): "ALL" | "B2B" {
  return channel === "business" ? "B2B" : "ALL";
}

export function repriceCustomerType(
  channel: AmazonRepriceChannel,
): "Consumer" | "Business" {
  return channel === "business" ? "Business" : "Consumer";
}
