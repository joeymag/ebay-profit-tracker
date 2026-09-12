import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  computeSuggestedPrice,
  listRepriceRules,
} from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

export async function GET() {
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

  try {
    const [{ listings }, rules] = await Promise.all([
      // Prefer Supabase / recent DONE report — never wait for a fresh report
      // (that path routinely exceeds Vercel gateway timeouts).
      fetchAmazonListings({ fast: true }),
      listRepriceRules(),
    ]);
    const ruleBySku = new Map(rules.map((rule) => [rule.sku, rule]));

    // Return listings + rules immediately. Competitive Buy Box data is loaded
    // in smaller batches via /api/amazon/repricer/competitive so this stays
    // under Vercel function timeouts.
    const rows = listings.map((listing) => {
      const rule = ruleBySku.get(listing.sku) ?? null;
      const { suggestedPrice, reason } = computeSuggestedPrice({
        currentPrice: listing.price,
        competitive: null,
        rule,
      });
      return {
        ...listing,
        rule,
        competitive: null,
        suggestedPrice,
        reason:
          rule?.enabled && rule.strategy !== "manual"
            ? "Loading Buy Box…"
            : reason,
      };
    });

    return NextResponse.json({
      ok: true,
      count: rows.length,
      rows,
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body.slice(0, 500) },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to load repricer data.";
    const code = message.includes("listings cache is empty")
      ? "CACHE_EMPTY"
      : undefined;
    return NextResponse.json(
      { ok: false, code, error: message },
      { status: code === "CACHE_EMPTY" ? 409 : 500 },
    );
  }
}
