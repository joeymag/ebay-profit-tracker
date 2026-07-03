import { NextResponse } from "next/server";

import { saveListingTitleChange } from "@/lib/ebay/listing-title-experiment";

export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { listingId } = await context.params;

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  let body: {
    title?: string;
    notes?: string;
    sku?: string | null;
    imageUrl?: string | null;
    applyToEbay?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!body.title?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Title is required." },
      { status: 400 },
    );
  }

  try {
    const result = await saveListingTitleChange({
      listingId,
      title: body.title,
      notes: body.notes,
      sku: body.sku,
      imageUrl: body.imageUrl,
      applyToEbay: body.applyToEbay,
    });

    return NextResponse.json({
      ok: true,
      period: result.period,
      ebayUpdateError: result.ebayUpdateError,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save title change";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
