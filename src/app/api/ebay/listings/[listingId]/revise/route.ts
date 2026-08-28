import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import {
  reviseEbayListingSkuAndPrice,
  type EbayVariationEdit,
} from "@/lib/ebay/listing-details";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

type ReviseBody = {
  isMultiVariation?: boolean;
  format?: string | null;
  currency?: string;
  title?: string | null;
  variations?: EbayVariationEdit[];
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

  let body: ReviseBody;
  try {
    body = (await request.json()) as ReviseBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const variations = Array.isArray(body.variations) ? body.variations : [];
  const title = body.title?.trim() || null;

  if (!variations.length && !title) {
    return NextResponse.json(
      { ok: false, error: "Provide a title and/or at least one variation update." },
      { status: 400 },
    );
  }

  if (title && title.length > 80) {
    return NextResponse.json(
      { ok: false, error: "Title must be 80 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const result = await reviseEbayListingSkuAndPrice({
      listingId,
      isMultiVariation: Boolean(body.isMultiVariation),
      format: body.format ?? null,
      currency: body.currency?.trim() || "GBP",
      title,
      variations,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: "EBAY_API_ERROR",
          status: error.status,
          details: error.body?.slice(0, 800),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to revise listing on eBay";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
