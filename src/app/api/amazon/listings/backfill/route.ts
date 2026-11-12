import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { amazonListingsCacheCount } from "@/lib/amazon/listings-store";
import { syncAmazonListingsToSupabase } from "@/lib/amazon/sync-listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 300;

export async function GET() {
  const config = getAmazonConfig();
  try {
    const count = await amazonListingsCacheCount(config.marketplaceId);
    return NextResponse.json({
      ok: true,
      status: count > 0 ? "ready" : "empty",
      count,
      marketplaceId: config.marketplaceId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not read amazon_listings.",
      },
      { status: 500 },
    );
  }
}

/**
 * Full re-runnable catalog backfill into public.amazon_listings.
 */
export async function POST(request: Request) {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
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
    new URL(request.url).searchParams.get("refreshReport") === "1" ||
    new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const result = await syncAmazonListingsToSupabase({ forceRefresh });
    return NextResponse.json({ ok: true, ...result });
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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Amazon listings backfill failed.",
      },
      { status: 500 },
    );
  }
}
