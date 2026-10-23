import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  autoMatchCompetitorOurSkus,
  deleteCompetitorListing,
  refreshCompetitorListing,
  updateCompetitorOurSku,
} from "@/lib/ebay/competitor-prices";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string; competitorId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

  let action = "refresh";
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    if (typeof body.action === "string" && body.action.trim()) {
      action = body.action.trim();
    }
  } catch {
    action = "refresh";
  }

  try {
    if (action === "auto-match") {
      const competitor = await autoMatchCompetitorOurSkus({
        competitorId,
        ourListingId: listingId,
      });
      const matched = competitor.prices.filter((row) => row.ourSku).length;
      return NextResponse.json({
        ok: true,
        competitor,
        message: `Matched ${matched} of ${competitor.prices.length} variations to your SKUs.`,
      });
    }

    const competitor = await refreshCompetitorListing(competitorId, listingId);
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
            : "Failed to update competitor prices.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { listingId, competitorId } = await context.params;

  if (!listingId?.trim() || !competitorId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID and competitor ID are required." },
      { status: 400 },
    );
  }

  let body: { specificsLabel?: unknown; ourSku?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const specificsLabel =
    typeof body.specificsLabel === "string" ? body.specificsLabel : "";
  const ourSku =
    typeof body.ourSku === "string"
      ? body.ourSku
      : body.ourSku === null
        ? null
        : "";

  if (!specificsLabel.trim()) {
    return NextResponse.json(
      { ok: false, error: "Variation specificsLabel is required." },
      { status: 400 },
    );
  }

  try {
    const competitor = await updateCompetitorOurSku({
      competitorId,
      ourListingId: listingId,
      specificsLabel,
      ourSku: ourSku === "" ? null : ourSku,
    });
    return NextResponse.json({ ok: true, competitor });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to save our SKU mapping.",
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
