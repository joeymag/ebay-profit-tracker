import {
  getStoredAmazonSellerId,
  saveAmazonSellerId,
} from "@/lib/amazon/token-store";

let cachedSellerId: string | null | undefined;

export async function resolveStoredSellerId(): Promise<string | null> {
  if (cachedSellerId !== undefined) return cachedSellerId;
  const fromEnv = process.env.AMAZON_SELLER_ID?.trim() || null;
  if (fromEnv) {
    cachedSellerId = fromEnv;
    return cachedSellerId;
  }
  cachedSellerId = await getStoredAmazonSellerId();
  return cachedSellerId;
}

export async function rememberSellerId(sellerId: string): Promise<void> {
  const trimmed = sellerId.trim();
  if (!trimmed) return;
  await saveAmazonSellerId(trimmed);
  cachedSellerId = trimmed;
}

/**
 * Resolve Amazon seller ID from env/store. Optional seed lookup is provided by
 * the Standard competitive module to avoid a circular dependency.
 */
export async function resolveAmazonSellerId(
  seedSku?: string,
  seedLookup?: (sku: string) => Promise<string | null>,
): Promise<string> {
  const fromEnv = process.env.AMAZON_SELLER_ID?.trim();
  if (fromEnv) return fromEnv;

  const stored = await resolveStoredSellerId();
  if (stored) return stored;

  if (!seedSku || !seedLookup) {
    throw new Error(
      "Amazon seller ID unknown. Open Amazon Repricer once so it can detect it, or set AMAZON_SELLER_ID.",
    );
  }

  const guess = await seedLookup(seedSku);
  if (!guess) {
    throw new Error(
      "Could not detect Amazon seller ID from offers. Set AMAZON_SELLER_ID in env.",
    );
  }
  await rememberSellerId(guess);
  return guess;
}
