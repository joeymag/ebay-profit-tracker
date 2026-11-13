import { NextResponse } from "next/server";

import { fetchBusinessOffersBatch } from "@/lib/amazon/business-offer";
import { AmazonApiError } from "@/lib/amazon/client";
import { getCompetitiveSnapshotsBatch } from "@/lib/amazon/pricing";
import {
  parseRepriceChannel,
  type AmazonRepriceChannel,
} from "@/lib/amazon/reprice-channel";
import {
  computeSuggestedPrice,
  listRepriceRules,
  type AmazonRepriceRule,
} from "@/lib/amazon/repricer";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

const MAX_SKUS = 20;

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

  let body: {
    skus?: unknown;
    prices?: unknown;
    bypassCache?: unknown;
    channel?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const channel: AmazonRepriceChannel =
    parseRepriceChannel(body.channel) ?? "standard";

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
    const businessOffers =
      channel === "business"
        ? await fetchBusinessOffersBatch(skus)
        : new Map();

    if (channel === "business") {
      for (const sku of skus) {
        const offer = businessOffers.get(sku);
        if (offer) priceBySku.set(sku, offer.businessPrice);
      }
    }

    const [rules, competitiveBySku] = await Promise.all([
      listRepriceRules(channel),
      getCompetitiveSnapshotsBatch({
        skus,
        channel,
        priceBySku,
        concurrency: 4,
        bypassCache: body.bypassCache === true,
      }),
    ]);
    const ruleBySku = new Map<string, AmazonRepriceRule>(
      rules.map((rule) => [rule.sku.trim(), rule]),
    );

    const suggestions = skus.map((sku) => {
      const rule = ruleBySku.get(sku.trim()) ?? null;
      const competitive = competitiveBySku.get(sku) ?? null;
      const businessOffer = businessOffers.get(sku);
      const currentPrice =
        channel === "business"
          ? (businessOffer?.businessPrice ?? null)
          : priceBySku.has(sku)
            ? priceBySku.get(sku)!
            : null;
      const { suggestedPrice, reason } = computeSuggestedPrice({
        currentPrice,
        competitive,
        rule,
        channel,
      });
      return {
        sku,
        channel,
        currentPrice,
        quantityDiscountPlan:
          rule?.quantityDiscountPlan ??
          businessOffer?.quantityDiscountPlan ??
          null,
        competitive,
        suggestedPrice,
        reason:
          competitive == null
            ? channel === "business"
              ? "No Business competitive data."
              : "Could not load Buy Box data."
            : reason,
        rule,
      };
    });

    return NextResponse.json({
      ok: true,
      channel,
      suggestions,
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
