"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Loader2,
  Save,
  Upload,
  Warehouse,
} from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AmazonListingContent } from "@/lib/amazon/listing-editor";
import { cn } from "@/lib/utils";

type DetailResponse =
  | {
      ok: true;
      content: AmazonListingContent;
      familySkus: string[];
      family: AmazonListingContent[];
    }
  | { ok: false; error: string; code?: string; details?: string };

type SaveResponse =
  | {
      ok: true;
      mode: "single" | "family";
      status?: string;
      issues?: Array<{ code?: string; message?: string; severity?: string }>;
      results?: Array<{
        sku: string;
        ok: boolean;
        status?: string;
        error?: string;
      }>;
    }
  | {
      ok: false;
      error: string;
      details?: string;
      results?: Array<{
        sku: string;
        ok: boolean;
        error?: string;
      }>;
    };

type Draft = {
  title: string;
  description: string;
  bulletPoints: string[];
  genericKeywords: string;
  imageUrls: string[];
};

function draftsFromContent(content: AmazonListingContent): Draft {
  const imageUrls = Array.from({ length: 9 }, (_, index) => {
    if (index === 0) {
      return content.images.find((image) => image.role === "main")?.url ?? "";
    }
    return (
      content.images.find((image) => image.role === `other_${index}`)?.url ?? ""
    );
  });
  const bullets = [...content.bulletPoints];
  while (bullets.length < 5) bullets.push("");
  return {
    title: content.title,
    description: content.description,
    bulletPoints: bullets.slice(0, 5),
    genericKeywords: content.genericKeywords,
    imageUrls,
  };
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {children}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type UploadResponse =
  | {
      ok: true;
      url?: string;
      urls: string[];
    }
  | { ok: false; error: string };

export function AmazonListingEditor({ sku }: { sku: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | "batch" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [family, setFamily] = useState<AmazonListingContent[]>([]);
  const [activeSku, setActiveSku] = useState(sku);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/amazon/listings/${encodeURIComponent(sku)}`,
      );
      const json = (await res.json()) as DetailResponse;
      if (!json.ok) {
        setError(json.error);
        setFamily([]);
        return;
      }
      const nextDrafts: Record<string, Draft> = {};
      for (const member of json.family) {
        nextDrafts[member.sku] = draftsFromContent(member);
      }
      setFamily(json.family);
      setDrafts(nextDrafts);
      setActiveSku(json.content.sku || sku);
    } catch {
      setError("Could not load this Amazon listing.");
    } finally {
      setLoading(false);
    }
  }, [sku]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => family.find((member) => member.sku === activeSku) ?? family[0] ?? null,
    [family, activeSku],
  );
  const draft = active ? drafts[active.sku] : null;

  const updateDraft = (patch: Partial<Draft>) => {
    if (!active) return;
    setDrafts((current) => ({
      ...current,
      [active.sku]: {
        ...(current[active.sku] ?? draftsFromContent(active)),
        ...patch,
      },
    }));
  };

  const uploadImages = async (
    files: FileList | File[],
    options?: { slot?: number },
  ) => {
    if (!active || !draft) return;
    const list = Array.from(files).filter((file) => file.size > 0);
    if (list.length === 0) return;

    const slot = options?.slot;
    setUploadingSlot(slot ?? "batch");
    setError(null);
    setMessage(null);

    try {
      const form = new FormData();
      for (const file of list.slice(0, 9)) {
        form.append("file", file);
      }
      const res = await fetch(
        `/api/amazon/listings/${encodeURIComponent(active.sku)}`,
        { method: "POST", body: form },
      );
      const json = (await res.json()) as UploadResponse;
      if (!json.ok) {
        setError(json.error || "Image upload failed.");
        return;
      }

      const urls = json.urls?.length
        ? json.urls
        : json.url
          ? [json.url]
          : [];
      if (urls.length === 0) {
        setError("Upload succeeded but no image URL was returned.");
        return;
      }

      const targetSku = active.sku;
      setDrafts((current) => {
        const previous =
          current[targetSku] ??
          draftsFromContent(
            family.find((member) => member.sku === targetSku) ?? active,
          );
        const imageUrls = [...previous.imageUrls];
        if (typeof slot === "number") {
          imageUrls[slot] = urls[0]!;
          let next = slot + 1;
          for (const url of urls.slice(1)) {
            while (next < imageUrls.length && imageUrls[next]?.trim()) {
              next += 1;
            }
            if (next >= imageUrls.length) break;
            imageUrls[next] = url;
            next += 1;
          }
        } else {
          let next = 0;
          for (const url of urls) {
            while (next < imageUrls.length && imageUrls[next]?.trim()) {
              next += 1;
            }
            if (next >= imageUrls.length) break;
            imageUrls[next] = url;
            next += 1;
          }
        }
        return {
          ...current,
          [targetSku]: { ...previous, imageUrls },
        };
      });
      setMessage(
        urls.length === 1
          ? "Image uploaded. Save to Amazon to apply it."
          : `${urls.length} images uploaded. Save to Amazon to apply them.`,
      );
    } catch {
      setError("Could not reach the Amazon image upload API.");
    } finally {
      setUploadingSlot(null);
    }
  };

  const save = async () => {
    if (!active || !draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/amazon/listings/${encodeURIComponent(active.sku)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title,
            description: draft.description,
            bulletPoints: draft.bulletPoints,
            genericKeywords: draft.genericKeywords,
            imageUrls: draft.imageUrls,
            productType: active.productType,
          }),
        },
      );
      const json = (await res.json()) as SaveResponse;
      if (!json.ok) {
        setError(json.error || "Save failed.");
        return;
      }
      const issueText =
        json.issues
          ?.map((issue) => issue.message)
          .filter(Boolean)
          .slice(0, 2)
          .join(" · ") || "";
      setMessage(
        issueText
          ? `Saved to Amazon (${json.status || "ACCEPTED"}). ${issueText}`
          : `Saved to Amazon (${json.status || "ACCEPTED"}).`,
      );
      await load();
    } catch {
      setError("Could not reach the Amazon listings save API.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !active) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading listing and variations…
      </div>
    );
  }

  if (error && !active) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not open listing</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            href="/amazon-listings"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft className="size-4" />
            Back to listings
          </Link>
          <Button type="button" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!active || !draft) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/amazon-listings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="size-4" />
          All listings
        </Link>
        <Badge variant="outline">{active.parentage}</Badge>
        {active.asin ? (
          <Badge variant="outline" className="font-mono">
            {active.asin}
          </Badge>
        ) : null}
        <Badge variant="secondary" className="font-mono">
          {active.sku}
        </Badge>
      </div>

      {family.length > 1 ? (
        <Card className="surface-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Variation family</CardTitle>
            <CardDescription>
              Pick a child to edit its own SEO search terms. Shared title,
              description, and bullets can differ per SKU too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {family.map((member) => {
              const selected = member.sku === active.sku;
              return (
                <button
                  key={member.sku}
                  type="button"
                  onClick={() => setActiveSku(member.sku)}
                  className={cn(
                    "flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-foreground bg-muted"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <LineItemImage
                    src={member.images[0]?.url ?? null}
                    alt={member.title}
                    className="size-8 rounded object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {member.parentage === "parent"
                        ? "Parent"
                        : member.parentage === "child"
                          ? "Variation"
                          : "Listing"}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {member.sku}
                    </span>
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="size-5 text-amber-600 dark:text-amber-400" />
              Edit listing
            </CardTitle>
            <CardDescription>
              Changes save to Amazon for SKU {active.sku}. SEO keywords are
              stored on this SKU only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <FieldLabel htmlFor="amazon-title">Title</FieldLabel>
              <Input
                id="amazon-title"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel
                htmlFor="amazon-description"
                hint="Product description shown on the detail page"
              >
                Description
              </FieldLabel>
              <textarea
                id="amazon-description"
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                rows={8}
                className="flex min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Bullet points</p>
              {draft.bulletPoints.map((bullet, index) => (
                <Input
                  key={`bullet-${index}`}
                  value={bullet}
                  placeholder={`Bullet ${index + 1}`}
                  onChange={(event) => {
                    const bulletPoints = [...draft.bulletPoints];
                    bulletPoints[index] = event.target.value;
                    updateDraft({ bulletPoints });
                  }}
                />
              ))}
            </div>

            <div className="space-y-2">
              <FieldLabel
                htmlFor="amazon-seo"
                hint="Backend search terms for this SKU only — parent SEO does not rank children"
              >
                SEO search terms
              </FieldLabel>
              <textarea
                id="amazon-seo"
                value={draft.genericKeywords}
                onChange={(event) =>
                  updateDraft({ genericKeywords: event.target.value })
                }
                rows={3}
                className="flex min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="keyword one, keyword two, …"
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Images</p>
                  <p className="text-xs text-muted-foreground">
                    Upload files or paste publicly reachable URLs. First is the
                    main image. Uploaded files are hosted, then sent to Amazon
                    on Save.
                  </p>
                </div>
                <label
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    uploadingSlot != null || saving
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer",
                  )}
                >
                  {uploadingSlot === "batch" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload images
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    disabled={uploadingSlot != null || saving}
                    onChange={(event) => {
                      const files = event.target.files;
                      if (files?.length) void uploadImages(files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
              {draft.imageUrls.map((url, index) => (
                <div key={`image-${index}`} className="flex gap-2">
                  <Input
                    value={url}
                    placeholder={
                      index === 0
                        ? "Main image URL"
                        : `Other image ${index} URL`
                    }
                    onChange={(event) => {
                      const imageUrls = [...draft.imageUrls];
                      imageUrls[index] = event.target.value;
                      updateDraft({ imageUrls });
                    }}
                  />
                  <label
                    className={cn(
                      buttonVariants({ variant: "outline", size: "icon" }),
                      "shrink-0",
                      uploadingSlot != null || saving
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                    )}
                    title={
                      index === 0
                        ? "Upload main image"
                        : `Upload other image ${index}`
                    }
                  >
                    {uploadingSlot === index ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    <span className="sr-only">
                      Upload{" "}
                      {index === 0 ? "main image" : `other image ${index}`}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      disabled={uploadingSlot != null || saving}
                      onChange={(event) => {
                        const files = event.target.files;
                        if (files?.length) {
                          void uploadImages(files, { slot: index });
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {message ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                {message}
              </p>
            ) : null}

            <div className="sticky bottom-0 -mx-6 border-t border-border/60 bg-card/95 px-6 py-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Saves title, description, bullets, SEO, and images for{" "}
                  <span className="font-mono">{active.sku}</span> to Amazon.
                </p>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save />
                      Save to Amazon
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card h-fit">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LineItemImage
              src={draft.imageUrls[0] || null}
              alt={draft.title}
              className="aspect-square w-full rounded-lg object-cover"
            />
            <p className="text-sm font-medium leading-snug">{draft.title}</p>
            <p className="text-xs text-muted-foreground">
              Product type: {active.productType}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
