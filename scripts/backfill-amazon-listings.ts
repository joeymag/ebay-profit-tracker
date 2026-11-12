import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const forceRefresh = process.argv.includes("--refresh-report");
  const { syncAmazonListingsToSupabase } = await import(
    "../src/lib/amazon/sync-listings"
  );
  const { amazonListingsCacheCount, listStoredAmazonListings } = await import(
    "../src/lib/amazon/listings-store"
  );

  console.log(
    forceRefresh
      ? "Backfilling Amazon listings (fresh inventory report)…"
      : "Backfilling Amazon listings…",
  );

  const result = await syncAmazonListingsToSupabase({ forceRefresh });
  const dbCount = await amazonListingsCacheCount(result.marketplaceId);
  const rows = await listStoredAmazonListings({
    marketplaceId: result.marketplaceId,
  });
  const withImages = rows.filter((row) => (row.image_urls?.length ?? 0) > 0)
    .length;

  console.log(
    JSON.stringify(
      {
        ...result,
        dbCount,
        withImages,
        sample: rows.slice(0, 5).map((row) => ({
          sku: row.sku,
          title: (row.title || "").slice(0, 48),
          parentage: row.parentage,
          images: row.image_urls?.length ?? 0,
          firstImage: row.image_urls?.[0] ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
