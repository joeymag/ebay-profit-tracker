import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  amazonListingsCacheCount,
  groupStoredAmazonListings,
  listStoredAmazonListings,
  rowToAmazonListing,
} from "@/lib/amazon/listings-store";
import { syncAmazonListingsToSupabase } from "@/lib/amazon/sync-listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { getSkuCostSnapshots } from "@/lib/products/listing-costs";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const existingCount = await amazonListingsCacheCount(config.marketplaceId);
    let syncedAt: string | null = null;
    let syncedFromAmazon = false;

    if (forceRefresh || existingCount === 0) {
      const synced = await syncAmazonListingsToSupabase({
        forceRefresh,
      });
      syncedAt = synced.fetchedAt;
      syncedFromAmazon = true;
    }

    const rows = await listStoredAmazonListings({
      marketplaceId: config.marketplaceId,
    });
    const listings = rows.map(rowToAmazonListing);
    const families = groupStoredAmazonListings(rows);

    const costBySku = new Map<
      string,
      { unitCost: number | null; defaultPostage: number | null }
    >();
    try {
      const costs = await getSkuCostSnapshots(
        listings.map((listing) => listing.sku),
        { inferPostageFromOrders: false },
      );
      for (const listing of listings) {
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

    const listingsWithCosts = listings.map(withCosts);
    const familiesWithCosts = families.map((family) => ({
      ...family,
      members: family.members.map(withCosts),
    }));

    const latestSynced = rows.reduce<string | null>((latest, row) => {
      if (!latest || row.synced_at > latest) return row.synced_at;
      return latest;
    }, syncedAt);

    return NextResponse.json({
      ok: true,
      env: config.env,
      region: config.region,
      marketplaceId: config.marketplaceId,
      count: listingsWithCosts.length,
      listings: listingsWithCosts,
      families: familiesWithCosts,
      familyCount: familiesWithCosts.length,
      relationshipsLoaded: familiesWithCosts.some((family) =>
        family.members.some(
          (member) =>
            member.parentage === "parent" || member.parentage === "child",
        ),
      ),
      fetchedAt: latestSynced || new Date().toISOString(),
      cached: !syncedFromAmazon,
      source: "supabase",
      syncedFromAmazon,
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
