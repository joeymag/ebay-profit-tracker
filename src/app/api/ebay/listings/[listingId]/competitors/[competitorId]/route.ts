import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  deleteCompetitorListing,
  refreshCompetitorListing,
} from "@/lib/ebay/competitor-prices";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string; competitorId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { listingId, competitorId } = await context.params;
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  if (!listingId?.trim() || !competitorId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID and competitor ID are required." },
      { status: 400 },
    );
  }

  try {
    const competitor = await refreshCompetitorListing(
      competitorId,
      listingId,
    );
    return NextResponse.json({ ok: true, competitor });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: "EBAY_API_ERROR",
          details: error.body?.slice(0, 500),
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
            : "Failed to refresh competitor prices.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { listingId, competitorId } = await context.params;

  if (!listingId?.trim() || !competitorId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID and competitor ID are required." },
      { status: 400 },
    );
  }

  try {
    await deleteCompetitorListing(competitorId, listingId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete competitor.",
      },
      { status: 500 },
    );
  }
}
