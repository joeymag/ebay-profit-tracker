import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { getSkuCostSnapshots } from "@/lib/products/listing-costs";

export const maxDuration = 120;

export async function GET(request: Request) {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        error:
          "Missing Amazon credentials. Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET.",
      },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONNECTED",
        error: "Amazon is not connected. Authorize in Settings → Amazon SP-API.",
      },
      { status: 400 },
    );
  }

  const forceRefresh =
    new URL(request.url).searchParams.get("refresh") === "1";

  try {
    // Default to cache / recent DONE report so the page does not 504.
    // Use ?refresh=1 only when you can wait (local/dev or after warm).
    const result = await fetchAmazonListings({
      forceRefresh,
      fast: !forceRefresh,
    });
    let listings = result.listings.map((listing) => ({
      ...listing,
      unitCost: null as number | null,
      defaultPostage: null as number | null,
    }));
    try {
      const costs = await getSkuCostSnapshots(
        listings.map((listing) => listing.sku),
        { inferPostageFromOrders: false },
      );
      listings = listings.map((listing) => ({
        ...listing,
        unitCost: listing.sku ? (costs.get(listing.sku)?.unitCost ?? null) : null,
        defaultPostage: listing.sku
          ? (costs.get(listing.sku)?.defaultPostage ?? null)
          : null,
      }));
    } catch {
      // Listings still load if the cost catalog is unavailable.
    }
    return NextResponse.json({
      ok: true,
      env: config.env,
      region: config.region,
      marketplaceId: result.marketplaceId,
      count: listings.length,
      listings,
      fetchedAt: result.fetchedAt,
      cached: result.cached,
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load Amazon listings.";
    const code = message.includes("not connected")
      ? "NOT_CONNECTED"
      : undefined;

    return NextResponse.json({ ok: false, code, error: message }, { status: 500 });
  }
}
