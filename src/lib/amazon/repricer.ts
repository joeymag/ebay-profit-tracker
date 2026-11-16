/**
 * Compatibility façade — prefer importing from:
 *   `@/lib/amazon/reprice/standard`
 *   `@/lib/amazon/reprice/business`
 *   `@/lib/amazon/reprice`
 */
export type {
  AmazonRepriceChannel,
  AmazonRepriceRule,
  AmazonRepriceEvent,
  RepriceStrategy,
  RepriceSuggestion,
  QuantityDiscountPlan,
  AutoRepriceResult,
} from "@/lib/amazon/reprice";
export { computeSuggestedPrice, REPRICE_STRATEGIES } from "@/lib/amazon/reprice";
export { runAmazonAutoReprice } from "@/lib/amazon/reprice";

export {
  listStandardRepriceRules as listRepriceRules,
  upsertStandardRepriceRule as upsertRepriceRule,
  listStandardRepriceEvents as listRepriceEvents,
  buildStandardRepriceSuggestion as buildRepriceSuggestion,
  updateStandardListingPrice as updateAmazonListingPrice,
} from "@/lib/amazon/reprice/standard";

import { listBusinessRepriceRules } from "@/lib/amazon/reprice/business";
import { listStandardRepriceRules } from "@/lib/amazon/reprice/standard";
import type { AmazonRepriceChannel, AmazonRepriceRule } from "@/lib/amazon/reprice";

/** @deprecated Prefer listStandardRepriceRules / listBusinessRepriceRules. */
export async function listAllRepriceRules(
  channel?: AmazonRepriceChannel,
): Promise<AmazonRepriceRule[]> {
  if (channel === "business") return listBusinessRepriceRules();
  if (channel === "standard") return listStandardRepriceRules();
  const [standard, business] = await Promise.all([
    listStandardRepriceRules(),
    listBusinessRepriceRules(),
  ]);
  return [...standard, ...business];
}
