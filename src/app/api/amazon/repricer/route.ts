import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { fetchAmazonListings } from "@/lib/amazon/listings";
import {
  buildRepriceSuggestion,
  listRepriceRules,
  type RepriceSuggestion,
} from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 120;

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
      fetchAmazonListings(),
      listRepriceRules(),
    ]);
    const ruleBySku = new Map(rules.map((rule) => [rule.sku, rule]));

    // Competitive calls are rate-limited — batch in small parallel chunks.
    const suggestions: RepriceSuggestion[] = [];
    const chunkSize = 3;
    for (let i = 0; i < listings.length; i += chunkSize) {
      const chunk = listings.slice(i, i + chunkSize);
      const part = await Promise.all(
        chunk.map((listing) =>
          buildRepriceSuggestion({
            sku: listing.sku,
            currentPrice: listing.price,
            rule: ruleBySku.get(listing.sku) ?? null,
          }),
        ),
      );
      suggestions.push(...part);
      if (i + chunkSize < listings.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    const rows = listings.map((listing) => {
      const suggestion = suggestions.find((s) => s.sku === listing.sku)!;
      return {
        ...listing,
        rule: suggestion.rule,
        competitive: suggestion.competitive,
        suggestedPrice: suggestion.suggestedPrice,
        reason: suggestion.reason,
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
