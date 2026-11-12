import { NextResponse } from "next/server";

import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import {
  updateAmazonListingContent,
  updateAmazonListingFamilyContent,
  type AmazonListingContentUpdate,
} from "@/lib/amazon/listing-editor";
import {
  applyLocalListingContentUpdate,
  getStoredAmazonListingFamily,
} from "@/lib/amazon/listings-store";
import { refreshAmazonListingFamilyInSupabase } from "@/lib/amazon/sync-listings";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import {
  ListingImageUploadError,
  listingImageFilesFromFormData,
  uploadListingImage,
} from "@/lib/uploads/image-upload";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

export async function GET(request: Request, context: RouteContext) {
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

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    if (forceRefresh) {
      if (!isSupabaseConfigured()) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
          },
          { status: 400 },
        );
      }
      const refreshed = await refreshAmazonListingFamilyInSupabase(sku);
      return NextResponse.json({
        ok: true,
        content: refreshed.content,
        familySkus: refreshed.familySkus,
        family: refreshed.family,
        source: "amazon",
        refreshed: true,
      });
    }

    if (isSupabaseConfigured()) {
      const stored = await getStoredAmazonListingFamily(sku);
      if (stored.content && stored.family.length > 0) {
        return NextResponse.json({
          ok: true,
          content: stored.content,
          familySkus: stored.familySkus,
          family: stored.family,
          source: "supabase",
          refreshed: false,
        });
      }
    }

    // Cold cache / missing row: live fetch and persist.
    const refreshed = await refreshAmazonListingFamilyInSupabase(sku);
    return NextResponse.json({
      ok: true,
      content: refreshed.content,
      familySkus: refreshed.familySkus,
      family: refreshed.family,
      source: "amazon",
      refreshed: true,
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
      if (isSupabaseConfigured()) {
        for (const row of results.filter((entry) => entry.ok)) {
          await applyLocalListingContentUpdate(row.sku, {
            title: update.title,
            description: update.description,
            bulletPoints: update.bulletPoints,
            genericKeywords: update.genericKeywords,
            imageUrls: update.imageUrls,
            status: row.status,
          }).catch(() => undefined);
        }
      }
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
    if (isSupabaseConfigured()) {
      await applyLocalListingContentUpdate(sku, {
        title: update.title,
        description: update.description,
        bulletPoints: update.bulletPoints,
        genericKeywords: update.genericKeywords,
        imageUrls: update.imageUrls,
        status: saved.status,
      }).catch(() => undefined);
    }
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
