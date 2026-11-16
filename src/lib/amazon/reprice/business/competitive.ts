import {
  loadCompetitiveSnapshot,
  loadCompetitiveSnapshots,
} from "@/lib/amazon/reprice/shared/competitive-engine";
import type { AmazonCompetitiveSnapshot } from "@/lib/amazon/reprice/shared/types";

const CHANNEL = "business" as const;
const CUSTOMER_TYPE = "Business" as const;

export async function getBusinessCompetitiveSnapshot(
  sku: string,
  yourListedPrice?: number | null,
  options?: { bypassCache?: boolean },
): Promise<AmazonCompetitiveSnapshot | null> {
  return loadCompetitiveSnapshot({
    channel: CHANNEL,
    customerType: CUSTOMER_TYPE,
    sku,
    yourListedPrice,
    bypassCache: options?.bypassCache,
    rejectEmptyOffers: true,
  });
}

export async function getBusinessCompetitiveSnapshotsBatch(input: {
  skus: string[];
  priceBySku?: Map<string, number | null>;
  bypassCache?: boolean;
}): Promise<Map<string, AmazonCompetitiveSnapshot | null>> {
  return loadCompetitiveSnapshots({
    channel: CHANNEL,
    customerType: CUSTOMER_TYPE,
    skus: input.skus,
    priceBySku: input.priceBySku,
    bypassCache: input.bypassCache,
    rejectEmptyOffers: true,
  });
}
