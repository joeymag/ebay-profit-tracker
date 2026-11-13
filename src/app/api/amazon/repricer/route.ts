import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  parseRepriceChannel,
  type AmazonRepriceChannel,
} from "@/lib/amazon/reprice-channel";
import {
  computeSuggestedPrice,
  listRepriceRules,
} from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

export async function GET(request: Request) {
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
  const channel: AmazonRepriceChannel =
    parseRepriceChannel(url.searchParams.get("channel")) ?? "standard";

  try {
    const [{ listings }, rules] = await Promise.all([
      fetchAmazonListings({ fast: true }),
      listRepriceRules(channel),
    ]);
    const ruleBySku = new Map(rules.map((rule) => [rule.sku.trim(), rule]));

    const rows = listings.map((listing) => {
      const rule = ruleBySku.get(listing.sku.trim()) ?? null;
      // Business current price is filled during competitive enrich.
      const currentPrice = channel === "standard" ? listing.price : null;
      const { suggestedPrice, reason } = computeSuggestedPrice({
        currentPrice,
        competitive: null,
        rule,
        channel,
      });
      return {
        ...listing,
        price: currentPrice,
        listPrice: listing.price,
        channel,
        rule,
        competitive: null,
        quantityDiscountPlan: rule?.quantityDiscountPlan ?? null,
        suggestedPrice,
        reason:
          rule?.enabled && rule.strategy !== "manual"
            ? channel === "business"
              ? "Loading Business pricing…"
              : "Loading Buy Box…"
            : reason,
      };
    });

    return NextResponse.json({
      ok: true,
      channel,
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
