import { createSupabaseAdmin } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const LISTING_IMAGES_BUCKET = "listing-images";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 10 * 1024 * 1024;

export type ListingImageMarketplace = "amazon" | "ebay";

export type UploadListingImageInput = {
  file: Blob | File;
  marketplace: ListingImageMarketplace;
  /** Amazon SKU or eBay listing ID — used only for the storage path. */
  listingKey: string;
  fileName?: string;
};

export type UploadListingImageResult = {
  url: string;
  path: string;
  contentType: string;
  bytes: number;
};

export class ListingImageUploadError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ListingImageUploadError";
    this.status = status;
  }
}

function extensionFor(contentType: string, fileName?: string): string {
  const fromName = fileName?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

function sanitizeKeyPart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "listing";
}

/**
 * Shared listing-image upload for Amazon and eBay.
 * Stores the file in the public Supabase `listing-images` bucket and returns
 * a hosted URL Amazon/eBay can reference on the listing.
 */
export async function uploadListingImage(
  input: UploadListingImageInput,
): Promise<UploadListingImageResult> {
  if (!isSupabaseConfigured()) {
    throw new ListingImageUploadError(
      "Image upload is not configured. Add Supabase URL and service role key.",
      503,
    );
  }

  const listingKey = input.listingKey.trim();
  if (!listingKey) {
    throw new ListingImageUploadError("Listing key is required for image upload.");
  }

  const fileName =
    input.fileName?.trim() ||
    (input.file instanceof File ? input.file.name : undefined) ||
    "image.jpg";
  const contentType = (input.file.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw new ListingImageUploadError(
      "Only JPEG, PNG, WebP, or GIF images are allowed.",
    );
  }

  const bytes = input.file.size;
  if (!bytes) {
    throw new ListingImageUploadError("That image file was empty.");
  }
  if (bytes > MAX_BYTES) {
    throw new ListingImageUploadError("Images must be 10 MB or smaller.");
  }

  const ext = extensionFor(contentType, fileName);
  const path = `${input.marketplace}/${sanitizeKeyPart(listingKey)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const supabase = createSupabaseAdmin();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error } = await supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (error) {
    throw new ListingImageUploadError(
      `Upload failed: ${error.message}`,
      502,
    );
  }

  const { data } = supabase.storage
    .from(LISTING_IMAGES_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new ListingImageUploadError(
      "Upload succeeded but no public URL was returned.",
      502,
    );
  }

  return {
    url: data.publicUrl,
    path,
    contentType,
    bytes,
  };
}

/** Extract one or more image files from multipart form data (`file` or `files`). */
export function listingImageFilesFromFormData(
  form: FormData,
): File[] {
  const files: File[] = [];
  for (const value of form.getAll("file")) {
    if (value instanceof File) files.push(value);
  }
  for (const value of form.getAll("files")) {
    if (value instanceof File) files.push(value);
  }
  return files;
}
