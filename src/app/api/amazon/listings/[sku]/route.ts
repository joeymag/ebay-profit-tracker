import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  fetchAmazonListingContent,
  fetchAmazonListingFamilyBySku,
  updateAmazonListingContent,
  updateAmazonListingFamilyContent,
  type AmazonListingContentUpdate,
} from "@/lib/amazon/listing-editor";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import {
  ListingImageUploadError,
  listingImageFilesFromFormData,
  uploadListingImage,
} from "@/lib/uploads/image-upload";

export const maxDuration = 120;

type RouteContext = {
  params: Promise<{ sku: string }>;
};

function notReadyResponse() {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        error:
          "Missing Amazon credentials. Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET.",
      },
      { status: 400 },
    );
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const blocked = notReadyResponse();
  if (blocked) return blocked;

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

  const { sku: rawSku } = await context.params;
  const sku = decodeURIComponent(rawSku || "").trim();
  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "SKU is required." },
      { status: 400 },
    );
  }

  try {
    const { content, familySkus } = await fetchAmazonListingFamilyBySku(sku);
    const familyContents = await Promise.all(
      familySkus.map(async (familySku) => {
        if (familySku === content.sku) return content;
        try {
          return await fetchAmazonListingContent(familySku);
        } catch {
          return {
            ...content,
            sku: familySku,
            title: familySku,
            description: "",
            bulletPoints: ["", "", "", "", ""],
            genericKeywords: "",
            images: [],
            parentSku: content.parentage === "parent" ? content.sku : content.parentSku,
            childSkus: [],
            parentage:
              familySku === content.parentSku
                ? ("parent" as const)
                : ("child" as const),
            status: null,
            asin: null,
            productType: content.productType,
          };
        }
      }),
    );

    return NextResponse.json({
      ok: true,
      content,
      familySkus,
      family: familyContents,
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body.slice(0, 500),
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
            : "Failed to load Amazon listing.",
      },
      { status: 500 },
    );
  }
}

/** Multipart image upload → public hosted URL(s) via shared upload helper. */
export async function POST(request: Request, context: RouteContext) {
  const { sku: rawSku } = await context.params;
  const sku = decodeURIComponent(rawSku || "").trim();
  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "SKU is required." },
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
          marketplace: "amazon",
          listingKey: sku,
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
            : "Failed to upload Amazon listing image.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = notReadyResponse();
  if (blocked) return blocked;

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

  const { sku: rawSku } = await context.params;
  const sku = decodeURIComponent(rawSku || "").trim();
  if (!sku) {
    return NextResponse.json(
      { ok: false, error: "SKU is required." },
      { status: 400 },
    );
  }

  let body: {
    title?: string;
    description?: string;
    bulletPoints?: string[];
    genericKeywords?: string;
    imageUrls?: string[];
    productType?: string;
    applyToFamily?: boolean;
    familySkus?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const update: AmazonListingContentUpdate = {};
  if (typeof body.title === "string") update.title = body.title;
  if (typeof body.description === "string") update.description = body.description;
  if (Array.isArray(body.bulletPoints)) {
    update.bulletPoints = body.bulletPoints.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  if (typeof body.genericKeywords === "string") {
    update.genericKeywords = body.genericKeywords;
  }
  if (Array.isArray(body.imageUrls)) {
    update.imageUrls = body.imageUrls.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }

  if (
    update.title == null &&
    update.description == null &&
    update.bulletPoints == null &&
    update.genericKeywords == null &&
    update.imageUrls == null
  ) {
    return NextResponse.json(
      { ok: false, error: "No listing fields to save." },
      { status: 400 },
    );
  }

  try {
    if (body.applyToFamily && Array.isArray(body.familySkus) && body.familySkus.length) {
      const results = await updateAmazonListingFamilyContent(
        body.familySkus,
        update,
      );
      const failed = results.filter((row) => !row.ok);
      return NextResponse.json({
        ok: failed.length === 0,
        mode: "family",
        results,
        error:
          failed.length > 0
            ? `Saved ${results.length - failed.length} of ${results.length}; ${failed.length} failed.`
            : undefined,
      });
    }

    const saved = await updateAmazonListingContent(sku, update, {
      productType: body.productType,
    });
    return NextResponse.json({
      ok: true,
      mode: "single",
      sku: saved.sku,
      status: saved.status,
      issues: saved.issues,
    });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body.slice(0, 500),
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
            : "Failed to save Amazon listing.",
      },
      { status: 500 },
    );
  }
}
