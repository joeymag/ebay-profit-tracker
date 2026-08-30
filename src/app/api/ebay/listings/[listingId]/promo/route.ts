import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  normalizeBidPercentage,
  updateEbayPromoRateByListingId,
} from "@/lib/ebay/promo-rates";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

type PromoBody = {
  bidPercentage?: number;
  campaignId?: string | null;
  adId?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const { listingId } = await context.params;
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "eBay is not connected. Authorize in Settings first.",
        code: "NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  let body: PromoBody;
  try {
    body = (await request.json()) as PromoBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawBid = body.bidPercentage;
  if (rawBid == null || !Number.isFinite(rawBid)) {
    return NextResponse.json(
      { ok: false, error: "bidPercentage is required." },
      { status: 400 },
    );
  }

  if (rawBid < 1 || rawBid > 100) {
    return NextResponse.json(
      { ok: false, error: "Promo rate must be between 1 and 100." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateEbayPromoRateByListingId({
      listingId,
      bidPercentage: normalizeBidPercentage(rawBid),
      campaignId: body.campaignId,
      adId: body.adId,
    });

    return NextResponse.json({
      ok: true,
      listingId: updated.listingId,
      bidPercentage: updated.bidPercentage,
      campaignId: updated.campaignId,
      adId: updated.adId,
      campaignName: updated.campaignName,
      adStatus: updated.adStatus,
    });
  } catch (error) {
    if (error instanceof EbayApiError) {
      const needsReconnect =
        error.status === 403 &&
        (error.body?.includes("scope") ||
          error.body?.includes("Access denied") ||
          error.body?.includes("Insufficient"));

      return NextResponse.json(
        {
          ok: false,
          error: needsReconnect
            ? "Updating promo rates needs sell.marketing. Reconnect eBay in Settings."
            : error.message,
          code: needsReconnect ? "SCOPE_REQUIRED" : "EBAY_API_ERROR",
          status: error.status,
          details: error.body?.slice(0, 800),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to update promo rate.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
