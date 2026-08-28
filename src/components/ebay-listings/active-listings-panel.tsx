"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActiveEbayListing } from "@/lib/ebay/active-listings";
import { activeListingNeedsSku } from "@/lib/ebay/listing-sku-status";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ActiveListingsResponse =
  | {
      ok: true;
      marketplaceId: string;
      listings: ActiveEbayListing[];
      inventoryItemsScanned: number;
      publishedCount: number;
      unpublishedCount: number;
      source?: string;
      promoCampaignsScanned?: number;
      promoAdsScanned?: number;
      promoWarning?: string | null;
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: string;
    };

type GenerateSkuResponse =
  | {
      ok: true;
      successCount: number;
      failureCount: number;
      results: Array<{
        listingId: string;
        ok: boolean;
        skus?: Array<{ specifics: string; sku: string }>;
        error?: string;
      }>;
    }
  | { ok: false; error: string };

function listingKey(listing: ActiveEbayListing): string {
  return listing.listingId ?? listing.sku;
}

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (price == null) {
    return "—";
  }

  return formatMoney(price, currency ?? "GBP");
}

function formatPromoRate(rate: number | null | undefined): string {
  if (rate == null) {
    return "—";
  }

  return `${rate.toFixed(rate % 1 === 0 ? 0 : 1)}%`;
}

export function ActiveEbayListingsPanel() {
  const [data, setData] = useState<Extract<ActiveListingsResponse, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<Extract<ActiveListingsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [skuPrefix, setSkuPrefix] = useState("EBAY");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(() => new Set());
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [skuMessage, setSkuMessage] = useState<string | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ebay/listings/active");
      const payload = (await response.json()) as ActiveListingsResponse;

      if (!payload.ok) {
        setData(null);
        setError(payload);
        return;
      }

      setData(payload);
    } catch {
      setData(null);
      setError({
        ok: false,
        error: "Could not reach the eBay listings endpoint.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const filtered = useMemo(() => {
    if (!data?.listings.length) {
      return [];
    }

    const needle = query.trim().toLowerCase();
    if (!needle) {
      return data.listings;
    }

    return data.listings.filter((listing) => {
      const haystack = [
        listing.title,
        listing.sku,
        listing.listingId,
        listing.offerId,
        listing.status,
        listing.promoCampaignName,
        listing.promoRatePercent != null ? `${listing.promoRatePercent}%` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [data, query]);

  const missingSkuCount = useMemo(
    () => (data?.listings ?? []).filter(activeListingNeedsSku).length,
    [data],
  );

  const selectedListings = useMemo(() => {
    if (!data?.listings.length || selectedKeys.size === 0) {
      return [];
    }

    return data.listings.filter((listing) => selectedKeys.has(listingKey(listing)));
  }, [data, selectedKeys]);

  const selectedNeedingSku = useMemo(
    () => selectedListings.filter(activeListingNeedsSku),
    [selectedListings],
  );

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((listing) => selectedKeys.has(listingKey(listing)));
  const someFilteredSelected =
    filtered.some((listing) => selectedKeys.has(listingKey(listing))) &&
    !allFilteredSelected;

  function toggleListingSelected(listing: ActiveEbayListing, checked: boolean) {
    const key = listingKey(listing);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function toggleSelectAllFiltered(checked: boolean) {
    if (!checked) {
      setSelectedKeys((current) => {
        const next = new Set(current);
        for (const listing of filtered) {
          next.delete(listingKey(listing));
        }
        return next;
      });
      return;
    }

    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const listing of filtered) {
        next.add(listingKey(listing));
      }
      return next;
    });
  }

  async function generateSkusForListings(listings: ActiveEbayListing[]) {
    const targets = listings.filter(activeListingNeedsSku);
    if (!targets.length) {
      setSkuError("Selected listings already have SKUs.");
      return;
    }

    const listingIds = targets
      .map((listing) => listing.listingId?.trim())
      .filter((listingId): listingId is string => Boolean(listingId));

    if (!listingIds.length) {
      setSkuError("Selected listings are missing listing IDs.");
      return;
    }

    const keys = targets.map(listingKey);
    setSkuError(null);
    setSkuMessage(null);
    setGeneratingKeys((current) => new Set([...current, ...keys]));

    try {
      const response = await fetch("/api/ebay/listings/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingIds,
          prefix: skuPrefix.trim() || "EBAY",
        }),
      });
      const payload = (await response.json()) as GenerateSkuResponse;

      if (!payload.ok) {
        setSkuError(payload.error);
        return;
      }

      const failures = payload.results.filter((result) => !result.ok);
      if (payload.successCount > 0) {
        await loadListings();
        setSelectedKeys(new Set());
      }

      if (payload.successCount === 0) {
        setSkuError(
          failures
            .map((result) => `${result.listingId}: ${result.error ?? "Failed"}`)
            .join(" · "),
        );
        return;
      }

      const skuCount = payload.results.reduce(
        (sum, result) => sum + (result.skus?.length ?? 0),
        0,
      );
      let message = `Generated ${skuCount} SKU${skuCount === 1 ? "" : "s"} for ${payload.successCount} listing${payload.successCount === 1 ? "" : "s"}.`;
      if (failures.length > 0) {
        message += ` ${failures.length} failed: ${failures
          .slice(0, 3)
          .map((result) => result.listingId)
          .join(", ")}${failures.length > 3 ? "…" : ""}.`;
      }
      setSkuMessage(message);
    } catch {
      setSkuError("Could not reach the SKU generation endpoint.");
    } finally {
      setGeneratingKeys((current) => {
        const next = new Set(current);
        for (const key of keys) {
          next.delete(key);
        }
        return next;
      });
    }
  }

  async function generateSkuForListing(listing: ActiveEbayListing) {
    await generateSkusForListings([listing]);
  }

  async function generateSkuForSelected() {
    if (!selectedNeedingSku.length) {
      setSkuError("Select listings that are missing SKUs.");
      return;
    }

    setBulkGenerating(true);
    try {
      await generateSkusForListings(selectedNeedingSku);
    } finally {
      setBulkGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading active listings from eBay Seller Hub…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load active listings</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error.code === "SCOPE_REQUIRED" || error.code === "NOT_CONNECTED" ? (
            <Link href="/settings" className={cn(buttonVariants())}>
              Go to Settings
            </Link>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void loadListings()}>
              Retry
            </Button>
          )}
          {error.details ? (
            <p className="font-mono text-xs text-muted-foreground">{error.details}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Active listings</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.publishedCount.toLocaleString("en-GB")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Live on {data.marketplaceId}
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>With promo rate</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.listings
                .filter((listing) => listing.promoRatePercent != null)
                .length.toLocaleString("en-GB")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Promoted Listings ads found
            {data.promoCampaignsScanned != null
              ? ` · ${data.promoCampaignsScanned} campaign${data.promoCampaignsScanned === 1 ? "" : "s"}`
              : ""}
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Missing SKU</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {missingSkuCount.toLocaleString("en-GB")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Listings using the eBay item ID as SKU
          </CardContent>
        </Card>
      </div>

      {skuMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>{skuMessage}</p>
        </div>
      ) : null}
      {skuError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {skuError}
        </div>
      ) : null}

      {data.promoWarning ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {data.promoWarning}{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Open Settings
          </Link>
        </div>
      ) : null}

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Active eBay listings</CardTitle>
              <CardDescription>
                Same eBay connection as fee sync · fetched{" "}
                {new Date(data.fetchedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, SKU, listing ID"
                  className="pl-9"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="ebay-sku-prefix" className="sr-only">
                  SKU prefix
                </label>
                <Input
                  id="ebay-sku-prefix"
                  value={skuPrefix}
                  onChange={(event) => setSkuPrefix(event.target.value.toUpperCase())}
                  placeholder="EBAY"
                  className="w-24 font-mono uppercase"
                  maxLength={20}
                  disabled={bulkGenerating || generatingKeys.size > 0}
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => void generateSkuForSelected()}
                disabled={
                  bulkGenerating ||
                  generatingKeys.size > 0 ||
                  selectedNeedingSku.length === 0
                }
              >
                {bulkGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate SKU
                    {selectedNeedingSku.length > 0
                      ? ` (${selectedNeedingSku.length})`
                      : ""}
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadListings()}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="space-y-2 p-6 text-sm text-muted-foreground">
              {data.listings.length === 0 ? (
                <>
                  <p>No active listings returned from eBay Seller Hub.</p>
                  <p>
                    Confirm eBay is connected in Settings, then refresh. If this
                    persists, reconnect eBay so the Trading API token is current.
                  </p>
                </>
              ) : (
                <p>No listings match “{query.trim()}”.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-6">
                      <input
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        checked={allFilteredSelected}
                        ref={(element) => {
                          if (element) {
                            element.indeterminate = someFilteredSelected;
                          }
                        }}
                        onChange={(event) =>
                          toggleSelectAllFiltered(event.target.checked)
                        }
                        aria-label="Select all listings"
                      />
                    </TableHead>
                    <TableHead className="w-16" />
                    <TableHead className="w-[26%]">Listing</TableHead>
                    <TableHead className="w-[14%]">SKU</TableHead>
                    <TableHead className="w-[12%]">Listing ID</TableHead>
                    <TableHead className="w-[10%] text-right">Price</TableHead>
                    <TableHead className="w-[10%] text-right">Promo</TableHead>
                    <TableHead className="w-[8%] text-right">Qty</TableHead>
                    <TableHead className="w-[10%]">Status</TableHead>
                    <TableHead className="w-[10%] pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((listing) => {
                    const detailHref = listing.listingId
                      ? `/ebay-listings/${encodeURIComponent(listing.listingId)}`
                      : null;
                    const key = listingKey(listing);
                    const needsSku = activeListingNeedsSku(listing);
                    const isGenerating = generatingKeys.has(key);

                    return (
                    <TableRow
                      key={key}
                      className={detailHref ? "hover:bg-muted/40" : undefined}
                    >
                      <TableCell className="pl-6 align-top">
                        <input
                          type="checkbox"
                          className="size-4 rounded border border-input"
                          checked={selectedKeys.has(key)}
                          onChange={(event) =>
                            toggleListingSelected(listing, event.target.checked)
                          }
                          aria-label={`Select ${listing.title ?? listing.sku}`}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        {detailHref ? (
                          <Link href={detailHref}>
                            <LineItemImage
                              src={listing.imageUrl}
                              alt={listing.title ?? listing.sku}
                            />
                          </Link>
                        ) : (
                          <LineItemImage
                            src={listing.imageUrl}
                            alt={listing.title ?? listing.sku}
                          />
                        )}
                      </TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top">
                        {detailHref ? (
                          <Link href={detailHref} className="block space-y-1">
                            <p className="line-clamp-2 font-medium leading-snug hover:underline">
                              {listing.title ?? listing.sku}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {listing.format
                                ? `${listing.format.replaceAll("_", " ").toLowerCase()} · `
                                : null}
                              Click for variations / stock
                            </p>
                          </Link>
                        ) : (
                          <p className="line-clamp-2 font-medium leading-snug">
                            {listing.title ?? listing.sku}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="min-w-0 align-top whitespace-normal font-mono text-sm">
                        <Badge
                          variant="outline"
                          className={cn(
                            "max-w-full truncate bg-background font-mono text-sm font-medium",
                            needsSku && "border-amber-500/40 text-amber-800 dark:text-amber-300",
                          )}
                          title={listing.sku}
                        >
                          {listing.sku}
                        </Badge>
                        {needsSku ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Missing SKU
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        {listing.listingId ? (
                          <div className="flex flex-col gap-1">
                            {detailHref ? (
                              <Link
                                href={detailHref}
                                className="font-mono text-sm hover:underline"
                              >
                                {listing.listingId}
                              </Link>
                            ) : (
                              <span className="font-mono text-sm">{listing.listingId}</span>
                            )}
                            {listing.itemWebUrl ? (
                              <a
                                href={listing.itemWebUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={(event) => event.stopPropagation()}
                              >
                                eBay
                                <ExternalLink className="size-3" />
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums align-top">
                        {formatPrice(listing.price, listing.currency)}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {listing.promoRatePercent != null ? (
                          <div className="space-y-1">
                            <Badge
                              variant="secondary"
                              className="tabular-nums"
                              title={
                                listing.promoCampaignName
                                  ? `${listing.promoCampaignName}${
                                      listing.promoAdStatus
                                        ? ` · ${listing.promoAdStatus}`
                                        : ""
                                    }`
                                  : listing.promoAdStatus ?? undefined
                              }
                            >
                              {formatPromoRate(listing.promoRatePercent)}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums align-top">
                        {listing.quantity != null
                          ? listing.quantity.toLocaleString("en-GB")
                          : "—"}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="secondary">
                          {listing.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right align-top">
                        {needsSku && listing.listingId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isGenerating || bulkGenerating}
                            onClick={() => void generateSkuForListing(listing)}
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Generating…
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-4" />
                                Generate SKU
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Loads Seller Hub listings via the Trading API and Promoted Listings ad
        rates via the Marketing API (same eBay login as fee sync). Select
        listings and use Generate SKU to assign unique seller SKUs on eBay, or
        click a listing to edit SKU/price and view variations.
      </p>
    </div>
  );
}
