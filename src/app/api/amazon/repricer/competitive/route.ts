import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { enrichBusinessCompetitive } from "@/lib/amazon/reprice/business";
import { parseRepriceChannel } from "@/lib/amazon/reprice-channel";
import { enrichStandardCompetitive } from "@/lib/amazon/reprice/standard";
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const channel = parseRepriceChannel(body.channel) ?? "standard";
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

  const prices: Record<string, number | null> = {};
  if (body.prices && typeof body.prices === "object" && !Array.isArray(body.prices)) {
    for (const [sku, value] of Object.entries(body.prices as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) prices[sku] = value;
      else if (value === null) prices[sku] = null;
    }
  }

  try {
    const suggestions =
      channel === "business"
        ? await enrichBusinessCompetitive({
            skus,
            standardPrices: prices,
            bypassCache: body.bypassCache === true,
          })
        : await enrichStandardCompetitive({
            skus,
            prices,
            bypassCache: body.bypassCache === true,
          });
    return NextResponse.json({ ok: true, channel, suggestions });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        { ok: false, error: error.message, details: error.body.slice(0, 500) },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to load competitive prices.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
