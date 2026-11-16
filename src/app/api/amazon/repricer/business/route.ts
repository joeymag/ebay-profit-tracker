import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { loadBusinessRepricerRows } from "@/lib/amazon/reprice/business";
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
    const rows = await loadBusinessRepricerRows();
    return NextResponse.json({
      ok: true,
      channel: "business",
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
      error instanceof Error ? error.message : "Failed to load Business repricer.";
    const code = message.includes("listings cache is empty")
      ? "CACHE_EMPTY"
      : undefined;
    return NextResponse.json(
      { ok: false, code, error: message },
      { status: code === "CACHE_EMPTY" ? 409 : 500 },
    );
  }
}
