import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  listCompetitorListings,
  upsertCompetitorListing,
} from "@/lib/ebay/competitor-prices";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { listingId } = await context.params;

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  try {
    const competitors = await listCompetitorListings(listingId);
    return NextResponse.json({ ok: true, competitors });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load competitor prices.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { listingId } = await context.params;
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  let body: { competitorName?: unknown; competitorItemId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const competitorName =
    typeof body.competitorName === "string" ? body.competitorName : "";
  const competitorItemId =
    typeof body.competitorItemId === "string" ? body.competitorItemId : "";

  try {
    const competitor = await upsertCompetitorListing({
      ourListingId: listingId,
      competitorName,
      competitorItemId,
    });
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
            : "Failed to save competitor prices.",
      },
      { status: 400 },
    );
  }
}
