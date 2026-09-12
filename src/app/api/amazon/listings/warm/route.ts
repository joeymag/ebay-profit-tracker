import { after, NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 300;

/**
 * Kick off a full Amazon merchant-listings report in the background and
 * persist it to Supabase. Returns immediately so the browser never waits
 * through a Vercel 504.
 */
export async function POST() {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONNECTED",
        error: "Amazon is not connected.",
      },
      { status: 400 },
    );
  }

  // Serve instantly if a fresh/stale cache already exists.
  try {
    const cached = await fetchAmazonListings({ fast: true });
    return NextResponse.json({
      ok: true,
      status: "ready",
      cached: cached.cached,
      count: cached.listings.length,
      fetchedAt: cached.fetchedAt,
    });
  } catch {
    // Cache empty — build in background.
  }

  after(async () => {
    try {
      const result = await fetchAmazonListings({ forceRefresh: true });
      console.info(
        "[amazon/listings/warm] ready",
        result.listings.length,
        result.fetchedAt,
      );
    } catch (error) {
      console.error(
        "[amazon/listings/warm] failed:",
        error instanceof Error ? error.message : error,
      );
    }
  });

  return NextResponse.json({
    ok: true,
    status: "warming",
    message:
      "Building Amazon listings cache in the background. Retry Repricer in 1–2 minutes.",
  });
}

export async function GET() {
  try {
    const result = await fetchAmazonListings({ fast: true });
    return NextResponse.json({
      ok: true,
      status: "ready",
      cached: result.cached,
      count: result.listings.length,
      fetchedAt: result.fetchedAt,
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Listings cache unavailable.";
    const code = message.includes("listings cache is empty")
      ? "CACHE_EMPTY"
      : undefined;
    return NextResponse.json(
      { ok: false, code, error: message, status: "empty" },
      { status: code === "CACHE_EMPTY" ? 409 : 500 },
    );
  }
}
