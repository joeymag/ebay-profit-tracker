import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/client";
import { getListingTitleExperiment } from "@/lib/ebay/listing-title-experiment";

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
    const experiment = await getListingTitleExperiment(listingId);
    return NextResponse.json({ ok: true, experiment });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to load listing experiment";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
