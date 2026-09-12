import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import {
  buildRepriceSuggestion,
  listRepriceRules,
} from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

const MAX_SKUS = 8;

export async function POST(request: Request) {
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

  let body: { skus?: unknown; prices?: unknown };
  try {
    body = (await request.json()) as { skus?: unknown; prices?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const skus = Array.isArray(body.skus)
    ? body.skus
        .filter((sku): sku is string => typeof sku === "string" && sku.trim() !== "")
        .map((sku) => sku.trim())
        .slice(0, MAX_SKUS)
    : [];

  if (skus.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one SKU." },
      { status: 400 },
    );
  }

  const priceBySku = new Map<string, number | null>();
  if (body.prices && typeof body.prices === "object" && !Array.isArray(body.prices)) {
    for (const [sku, value] of Object.entries(
      body.prices as Record<string, unknown>,
    )) {
      if (typeof value === "number" && Number.isFinite(value)) {
        priceBySku.set(sku, value);
      } else if (value === null) {
        priceBySku.set(sku, null);
      }
    }
  }

  try {
    const rules = await listRepriceRules();
    const ruleBySku = new Map(rules.map((rule) => [rule.sku, rule]));

    const suggestions = [];
    for (const sku of skus) {
      suggestions.push(
        await buildRepriceSuggestion({
          sku,
          currentPrice: priceBySku.has(sku) ? priceBySku.get(sku)! : null,
          rule: ruleBySku.get(sku) ?? null,
        }),
      );
      // Soft pacing for Amazon pricing rate limits.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    return NextResponse.json({
      ok: true,
      suggestions: suggestions.map((s) => ({
        sku: s.sku,
        competitive: s.competitive,
        suggestedPrice: s.suggestedPrice,
        reason: s.reason,
        rule: s.rule,
      })),
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body.slice(0, 500) },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load competitive prices.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
