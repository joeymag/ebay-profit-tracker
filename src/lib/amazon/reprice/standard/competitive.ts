import {
  loadCompetitiveSnapshot,
  loadCompetitiveSnapshots,
} from "@/lib/amazon/reprice/shared/competitive-engine";
import type { AmazonCompetitiveSnapshot } from "@/lib/amazon/reprice/shared/types";

const CHANNEL = "standard" as const;
const CUSTOMER_TYPE = "Consumer" as const;

export async function getStandardCompetitiveSnapshot(
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
  });
}

export async function getStandardCompetitiveSnapshotsBatch(input: {
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
  });
}
