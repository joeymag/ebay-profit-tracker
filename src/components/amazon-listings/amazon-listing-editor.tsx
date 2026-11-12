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
  CircleHelp,
  Loader2,
  RefreshCw,
  Save,
  Upload,
} from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AmazonSeoChecker } from "@/components/amazon-listings/amazon-seo-checker";
import type { AmazonListingContent } from "@/lib/amazon/listing-editor";
import {
  AMAZON_BACKEND_SEARCH_MAX_BYTES,
  utf8ByteLength,
} from "@/lib/amazon/seo-checker";
import { cn } from "@/lib/utils";

const AMAZON_TITLE_MAX_CHARS = 190;

type DetailResponse =
  | {
      ok: true;
      content: AmazonListingContent;
      familySkus: string[];
      family: AmazonListingContent[];
      source?: "supabase" | "amazon";
      refreshed?: boolean;
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
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium tracking-tight text-foreground"
      >
        {children}
      </label>
      {hint ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const textareaClassName =
  "flex w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

type UploadResponse =
  | {
      ok: true;
      url?: string;
      urls: string[];
    }
  | { ok: false; error: string };

function parentageLabel(parentage: string): string {
  if (parentage === "parent") return "Parent";
  if (parentage === "child") return "Variation";
  return "Listing";
}

export function AmazonListingEditor({
  sku,
  onBack,
}: {
  sku: string;
  /** When set, Back stays on the current page instead of routing away. */
  onBack?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | "batch" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState<"supabase" | "amazon" | null>(null);
  const [family, setFamily] = useState<AmazonListingContent[]>([]);
  const [activeSku, setActiveSku] = useState(sku);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = useCallback(async (options?: { refresh?: boolean }) => {
    const refresh = options?.refresh === true;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    if (!refresh) setMessage(null);
    try {
      const res = await fetch(
        `/api/amazon/listings/${encodeURIComponent(sku)}${
          refresh ? "?refresh=1" : ""
        }`,
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
      setSource(json.source ?? null);
      if (refresh) {
        setMessage("Updated from Amazon.");
      }
    } catch {
      setError(
        refresh
          ? "Could not refresh this listing from Amazon."
          : "Could not load this Amazon listing.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
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
          ? "Image uploaded. Save to apply it on Amazon."
          : `${urls.length} images uploaded. Save to apply them on Amazon.`,
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
          ? `Saved (${json.status || "ACCEPTED"}). ${issueText}`
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
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading listing…
      </div>
    );
  }

  const backControl = onBack ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground"
      onClick={onBack}
    >
      <ArrowLeft className="size-4" />
      Listings
    </Button>
  ) : (
    <Link
      href="/amazon-listings"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "-ml-2 text-muted-foreground",
      )}
    >
      <ArrowLeft className="size-4" />
      Listings
    </Link>
  );

  if (error && !active) {
    return (
      <Card className="surface-card max-w-lg">
        <CardHeader className="space-y-2">
          <CardTitle>Could not open listing</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {onBack ? (
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : (
            <Link
              href="/amazon-listings"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
          )}
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

  const busy = saving || refreshing || uploadingSlot != null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* Top bar: identity + primary actions */}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          {backControl}
          <div className="space-y-1.5">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground md:text-2xl">
              {draft.title.trim() || "Untitled listing"}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono text-foreground/80">{active.sku}</span>
              {active.asin ? (
                <>
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                  <span className="font-mono">{active.asin}</span>
                </>
              ) : null}
              <span aria-hidden className="text-border">
                ·
              </span>
              <span>{parentageLabel(active.parentage)}</span>
              {source ? (
                <>
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                  <span>{source === "supabase" ? "Cached" : "Live"}</span>
                </>
              ) : null}
              {active.productType ? (
                <>
                  <span aria-hidden className="text-border">
                    ·
                  </span>
                  <span className="truncate">{active.productType}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-8">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void load({ refresh: true })}
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? "Saving…" : "Save to Amazon"}
          </Button>
        </div>
      </div>

      {(error || message) && (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            error
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-emerald-500/25 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300",
          )}
        >
          {error || message}
        </div>
      )}

      {/* Variation switcher — compact, only when needed */}
      {family.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Variations
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {family.map((member) => {
              const selected = member.sku === active.sku;
              return (
                <button
                  key={member.sku}
                  type="button"
                  onClick={() => setActiveSku(member.sku)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-foreground/20 bg-muted shadow-sm"
                      : "border-transparent bg-muted/40 hover:bg-muted/70",
                  )}
                >
                  <LineItemImage
                    src={member.images[0]?.url ?? null}
                    alt={member.title}
                    className="size-9 rounded-md object-cover"
                  />
                  <span className="min-w-0 pr-1">
                    <span className="block text-sm font-medium leading-none">
                      {parentageLabel(member.parentage)}
                    </span>
                    <span className="mt-1 block max-w-[9rem] truncate font-mono text-[11px] text-muted-foreground">
                      {member.sku}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        {/* Main form */}
        <div className="space-y-8">
          <section className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FieldLabel htmlFor="amazon-title">Title</FieldLabel>
                <TooltipProvider delay={200}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Amazon title format guide"
                    >
                      <CircleHelp className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      align="start"
                      sideOffset={8}
                      className="max-w-[min(36rem,calc(100vw-2rem))] border border-border bg-background p-2 text-foreground shadow-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- static public guide image */}
                      <img
                        src="/amazon/title-format-guide.png"
                        alt="Amazon title format: Brand Name + Top Phrase - Keywords 1, Keywords 2, Keywords 3, under 190 characters"
                        className="h-auto w-full max-w-xl rounded-sm"
                      />
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="amazon-title"
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                aria-invalid={draft.title.length > AMAZON_TITLE_MAX_CHARS}
                className={cn(
                  "h-10 text-base md:text-sm",
                  draft.title.length > AMAZON_TITLE_MAX_CHARS &&
                    "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
                )}
              />
              <p
                className={cn(
                  "text-xs",
                  draft.title.length > AMAZON_TITLE_MAX_CHARS
                    ? "font-medium text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {draft.title.length}/{AMAZON_TITLE_MAX_CHARS} characters
                {draft.title.length > AMAZON_TITLE_MAX_CHARS
                  ? ` — ${draft.title.length - AMAZON_TITLE_MAX_CHARS} over limit`
                  : ""}
              </p>
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="amazon-description">Description</FieldLabel>
              <textarea
                id="amazon-description"
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
                rows={7}
                className={cn(textareaClassName, "min-h-36 resize-y")}
              />
            </div>

            <div className="space-y-3">
              <FieldLabel htmlFor="amazon-bullet-0">Bullet points</FieldLabel>
              <div className="space-y-2">
                {draft.bulletPoints.map((bullet, index) => (
                  <div key={`bullet-${index}`} className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <Input
                      id={index === 0 ? "amazon-bullet-0" : undefined}
                      value={bullet}
                      placeholder={`Feature ${index + 1}`}
                      onChange={(event) => {
                        const bulletPoints = [...draft.bulletPoints];
                        bulletPoints[index] = event.target.value;
                        updateDraft({ bulletPoints });
                      }}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border/60 pt-8">
            <FieldLabel
              htmlFor="amazon-seo"
              hint="Search terms for this SKU only."
            >
              SEO search terms
            </FieldLabel>
            <textarea
              id="amazon-seo"
              value={draft.genericKeywords}
              onChange={(event) =>
                updateDraft({ genericKeywords: event.target.value })
              }
              rows={2}
              aria-invalid={
                utf8ByteLength(draft.genericKeywords) >
                AMAZON_BACKEND_SEARCH_MAX_BYTES
              }
              className={cn(
                textareaClassName,
                "min-h-16 resize-y",
                utf8ByteLength(draft.genericKeywords) >
                  AMAZON_BACKEND_SEARCH_MAX_BYTES &&
                  "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
              )}
              placeholder="keyword one, keyword two…"
            />
            <p
              className={cn(
                "text-xs",
                utf8ByteLength(draft.genericKeywords) >
                  AMAZON_BACKEND_SEARCH_MAX_BYTES
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {utf8ByteLength(draft.genericKeywords)}/
              {AMAZON_BACKEND_SEARCH_MAX_BYTES} UTF-8 bytes
              {utf8ByteLength(draft.genericKeywords) >
              AMAZON_BACKEND_SEARCH_MAX_BYTES
                ? ` — ${utf8ByteLength(draft.genericKeywords) - AMAZON_BACKEND_SEARCH_MAX_BYTES} over limit`
                : ""}
            </p>
          </section>

          <AmazonSeoChecker
            sku={active.sku}
            title={draft.title}
            bulletPoints={draft.bulletPoints}
            description={draft.description}
            backendSearchTerms={draft.genericKeywords}
          />

          <section className="space-y-4 border-t border-border/60 pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <FieldLabel htmlFor="amazon-image-0">
                Images
              </FieldLabel>
              <label
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  busy ? "pointer-events-none opacity-50" : "cursor-pointer",
                )}
              >
                {uploadingSlot === "batch" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files?.length) void uploadImages(files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              First slot is the main image. Upload a file or paste a URL.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {draft.imageUrls.map((url, index) => (
                <div
                  key={`image-${index}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-muted/20"
                >
                  <div className="relative aspect-square bg-muted/40">
                    {url.trim() ? (
                      <LineItemImage
                        src={url}
                        alt={
                          index === 0
                            ? "Main image"
                            : `Image ${index + 1}`
                        }
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                        Empty
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent px-2 pb-2 pt-6">
                      <span className="text-[11px] font-medium text-white/95">
                        {index === 0 ? "Main" : index + 1}
                      </span>
                      <label
                        className={cn(
                          "inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-foreground shadow-sm hover:bg-white",
                          busy && "pointer-events-none opacity-50",
                        )}
                        title={
                          index === 0
                            ? "Upload main image"
                            : `Upload image ${index + 1}`
                        }
                      >
                        {uploadingSlot === index ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Upload className="size-3.5" />
                        )}
                        <span className="sr-only">
                          Upload{" "}
                          {index === 0 ? "main image" : `image ${index + 1}`}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          disabled={busy}
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
                  </div>
                  <Input
                    id={index === 0 ? "amazon-image-0" : undefined}
                    value={url}
                    placeholder="Image URL"
                    onChange={(event) => {
                      const imageUrls = [...draft.imageUrls];
                      imageUrls[index] = event.target.value;
                      updateDraft({ imageUrls });
                    }}
                    className="h-8 rounded-none border-0 border-t border-border/60 bg-transparent px-2.5 text-xs shadow-none focus-visible:ring-0"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Mobile / bottom save — mirrors top primary action */}
          <div className="sticky bottom-3 z-10 flex items-center justify-end gap-2 rounded-xl border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur lg:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void load({ refresh: true })}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void save()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save to Amazon
            </Button>
          </div>
        </div>

        {/* Sticky preview rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview
            </p>
            <LineItemImage
              src={draft.imageUrls[0] || null}
              alt={draft.title}
              className="aspect-square w-full rounded-xl object-cover"
            />
            <p className="line-clamp-4 text-sm font-medium leading-snug text-foreground">
              {draft.title.trim() || "Untitled listing"}
            </p>
            <ul className="space-y-1.5 border-t border-border/50 pt-3">
              {draft.bulletPoints
                .filter((b) => b.trim())
                .slice(0, 3)
                .map((bullet, index) => (
                  <li
                    key={`preview-bullet-${index}`}
                    className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    · {bullet}
                  </li>
                ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
