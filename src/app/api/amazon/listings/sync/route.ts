import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { syncAmazonListingsToSupabase } from "@/lib/amazon/sync-listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const maxDuration = 120;

export async function POST(request: Request) {
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

  const url = new URL(request.url);
  let forceRefresh = url.searchParams.get("refresh") === "1";
  if (!forceRefresh) {
    try {
      const body = (await request.json()) as { forceRefresh?: boolean };
      forceRefresh = body?.forceRefresh === true;
    } catch {
      forceRefresh = false;
    }
  }

  try {
    const result = await syncAmazonListingsToSupabase({ forceRefresh });
    return NextResponse.json({
      ok: true,
      ...result,
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
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync Amazon listings into Supabase.",
      },
      { status: 500 },
    );
  }
}
