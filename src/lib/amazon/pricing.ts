/**
 * Compatibility façade for competitive snapshots + seller ID.
 * Prefer `@/lib/amazon/reprice/standard` or `@/lib/amazon/reprice/business`.
 */
export type { AmazonCompetitiveSnapshot } from "@/lib/amazon/reprice/shared/types";
export { COMPETITIVE_CACHE_TTL_MS } from "@/lib/amazon/reprice/shared/competitive-engine";

import {
  getBusinessCompetitiveSnapshot,
  getBusinessCompetitiveSnapshotsBatch,
} from "@/lib/amazon/reprice/business";
import type {
  AmazonCompetitiveSnapshot,
  AmazonRepriceChannel,
} from "@/lib/amazon/reprice/shared/types";
import { resolveAmazonSellerId as resolveSellerId } from "@/lib/amazon/reprice/shared/seller-id";
import {
  getStandardCompetitiveSnapshot,
  getStandardCompetitiveSnapshotsBatch,
} from "@/lib/amazon/reprice/standard";

export async function resolveAmazonSellerId(seedSku?: string): Promise<string> {
  return resolveSellerId(seedSku, async (seed) => {
    const snap = await getStandardCompetitiveSnapshot(seed, null, {
      bypassCache: true,
    });
    return snap?.sellerIdGuess ?? null;
  });
}

export async function getCompetitiveSnapshot(
  sku: string,
  yourListedPrice?: number | null,
  options?: { bypassCache?: boolean; channel?: AmazonRepriceChannel },
): Promise<AmazonCompetitiveSnapshot> {
  const channel = options?.channel ?? "standard";
  const snap =
    channel === "business"
      ? await getBusinessCompetitiveSnapshot(sku, yourListedPrice, options)
      : await getStandardCompetitiveSnapshot(sku, yourListedPrice, options);
  if (!snap) {
    return {
      sku,
      channel,
      buyBoxPrice: null,
      lowestPrice: null,
      offerCount: 0,
      yourOfferPrice: yourListedPrice ?? null,
      youHaveBuyBox: null,
      sellerIdGuess: null,
    };
  }
  return snap;
}

export async function getCompetitiveSnapshotsBatch(input: {
  skus: string[];
  channel?: AmazonRepriceChannel;
  priceBySku?: Map<string, number | null>;
  concurrency?: number;
  bypassCache?: boolean;
}): Promise<Map<string, AmazonCompetitiveSnapshot | null>> {
  if (input.channel === "business") {
    return getBusinessCompetitiveSnapshotsBatch(input);
  }
  return getStandardCompetitiveSnapshotsBatch(input);
}
