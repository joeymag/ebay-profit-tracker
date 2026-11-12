import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { listAmazonListingFamilies } from "@/lib/amazon/listing-editor";
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

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const skipRelationships = url.searchParams.get("relationships") === "0";

  try {
    const result = await listAmazonListingFamilies({
      forceRefresh,
      fast: !forceRefresh,
      includeRelationships: !skipRelationships,
    });

    const costBySku = new Map<
      string,
      { unitCost: number | null; defaultPostage: number | null }
    >();
    try {
      const costs = await getSkuCostSnapshots(
        result.listings.map((listing) => listing.sku),
        { inferPostageFromOrders: false },
      );
      for (const listing of result.listings) {
        if (!listing.sku) continue;
        costBySku.set(listing.sku, {
          unitCost: costs.get(listing.sku)?.unitCost ?? null,
          defaultPostage: costs.get(listing.sku)?.defaultPostage ?? null,
        });
      }
    } catch {
      // Listings still load if the cost catalog is unavailable.
    }

    const withCosts = <T extends { sku: string }>(row: T) => ({
      ...row,
      unitCost: costBySku.get(row.sku)?.unitCost ?? null,
      defaultPostage: costBySku.get(row.sku)?.defaultPostage ?? null,
    });

    const listings = result.listings.map(withCosts);
    const families = result.families.map((family) => ({
      ...family,
      members: family.members.map(withCosts),
    }));

    return NextResponse.json({
      ok: true,
      env: config.env,
      region: config.region,
      marketplaceId: result.marketplaceId,
      count: listings.length,
      listings,
      families,
      familyCount: families.length,
      relationshipsLoaded: result.relationshipsLoaded,
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
