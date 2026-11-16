import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { loadBusinessRepricerRows } from "@/lib/amazon/reprice/business";
import { parseRepriceChannel } from "@/lib/amazon/reprice-channel";
import { loadStandardRepricerRows } from "@/lib/amazon/reprice/standard";
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

  const channel =
    parseRepriceChannel(new URL(request.url).searchParams.get("channel")) ??
    "standard";

  try {
    const rows =
      channel === "business"
        ? await loadBusinessRepricerRows()
        : await loadStandardRepricerRows();
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
