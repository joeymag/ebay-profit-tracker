import { NextResponse } from "next/server";

import {
  applyDescriptionTemplateToListings,
  DESCRIPTION_TEMPLATE_BATCH_SIZE,
} from "@/lib/ebay/bulk-description-template";
import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 300;

type BulkDescriptionBody = {
  listingIds?: string[];
};

export async function POST(request: Request) {
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

  let body: BulkDescriptionBody;
  try {
    body = (await request.json()) as BulkDescriptionBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const listingIds = Array.isArray(body.listingIds)
    ? [...new Set(body.listingIds.map((id) => id.trim()).filter(Boolean))]
    : [];

  if (!listingIds.length) {
    return NextResponse.json(
      { ok: false, error: "Provide at least one listingId." },
      { status: 400 },
    );
  }

  if (listingIds.length > DESCRIPTION_TEMPLATE_BATCH_SIZE) {
    return NextResponse.json(
      {
        ok: false,
        error: `Apply the template to at most ${DESCRIPTION_TEMPLATE_BATCH_SIZE} listings at a time.`,
      },
      { status: 400 },
    );
  }

  const results = await applyDescriptionTemplateToListings(listingIds);
  const successCount = results.filter((result) => result.ok && !result.skipped).length;
  const skippedCount = results.filter((result) => result.ok && result.skipped).length;

  return NextResponse.json({
    ok: true,
    successCount,
    skippedCount,
    failureCount: results.length - successCount - skippedCount,
    results,
  });
}
