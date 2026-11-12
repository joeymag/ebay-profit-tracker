import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/client";
import { getListingTitleExperiment } from "@/lib/ebay/listing-title-experiment";
import {
  ListingImageUploadError,
  listingImageFilesFromFormData,
  uploadListingImage,
} from "@/lib/uploads/image-upload";

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

/** Multipart image upload → public hosted URL(s) via shared upload helper. */
export async function POST(request: Request, context: RouteContext) {
  const { listingId } = await context.params;

  if (!listingId?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Listing ID is required." },
      { status: 400 },
    );
  }

  let form: globalThis.FormData;
  try {
    // Cast: conflicting FormData typings can omit methods under Next/DOM merge.
    form = (await request.formData()) as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart form data with image file(s)." },
      { status: 400 },
    );
  }

  const files = listingImageFilesFromFormData(form);
  if (!files.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose one or more image files (field name: file or files).",
      },
      { status: 400 },
    );
  }

  try {
    const uploads = [];
    for (const file of files) {
      uploads.push(
        await uploadListingImage({
          file,
          marketplace: "ebay",
          listingKey: listingId,
          fileName: file.name,
        }),
      );
    }
    return NextResponse.json({
      ok: true,
      urls: uploads.map((row) => row.url),
      uploads,
    });
  } catch (error) {
    if (error instanceof ListingImageUploadError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload eBay listing image.",
      },
      { status: 500 },
    );
  }
}
