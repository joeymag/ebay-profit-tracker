import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { fetchAmazonListings } = await import("../src/lib/amazon/listings");
  console.log("Warming Amazon listings cache…");
  const result = await fetchAmazonListings({ forceRefresh: true });
  console.log(
    JSON.stringify(
      {
        count: result.listings.length,
        fetchedAt: result.fetchedAt,
        cached: result.cached,
        sample: result.listings.slice(0, 3).map((l) => ({
          sku: l.sku,
          title: l.title.slice(0, 50),
          price: l.price,
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
