import { runBusinessAutoReprice } from "@/lib/amazon/reprice/business";
import { runStandardAutoReprice } from "@/lib/amazon/reprice/standard";
import type { AutoRepriceResult } from "@/lib/amazon/reprice/shared/types";

/** Run Standard then Business auto-reprice as independent modules. */
export async function runAmazonAutoReprice(): Promise<AutoRepriceResult> {
  const standard = await runStandardAutoReprice();
  const business = await runBusinessAutoReprice();
  return {
    checked: standard.checked + business.checked,
    applied: standard.applied + business.applied,
    skipped: standard.skipped + business.skipped,
    failed: standard.failed + business.failed,
    results: [...standard.results, ...business.results],
  };
}

export type {
  AmazonRepriceChannel,
  AmazonRepriceRule,
  AmazonRepriceEvent,
  AmazonCompetitiveSnapshot,
  RepriceStrategy,
  RepriceSuggestion,
  QuantityDiscountPlan,
  AutoRepriceResult,
} from "@/lib/amazon/reprice/shared/types";

export {
  computeSuggestedPrice,
  computeStandardMidGapTarget,
  resolveStandardGapOffsets,
  getGlobalStandardGapOffsets,
} from "@/lib/amazon/reprice/shared/suggest";
export {
  parseQuantityDiscountPlan,
  quantityDiscountPlanToJson,
  quantityDiscountPlanToAmazonPatch,
} from "@/lib/amazon/reprice/shared/quantity-plan";
export {
  REPRICE_STRATEGIES,
  STANDARD_DEFAULT_UNDERCUT,
  BUSINESS_DEFAULT_UNDERCUT,
  defaultUndercutForChannel,
} from "@/lib/amazon/reprice/shared/types";
