"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Percent, Search, Sparkles } from "lucide-react";

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
import { applyPricePercentChange } from "@/lib/ebay/price-percent";
import { activeListingNeedsSku } from "@/lib/ebay/listing-sku-status";
import { formatMoney } from "@/lib/format";
import { calculateEbayItemProfit } from "@/lib/orders/ebay-profit-calculator";
import { cn } from "@/lib/utils";

const SELLING_FEE_STORAGE_KEY = "ebay-listing-selling-fee-percent";
const DEFAULT_SELLING_FEE_PERCENT = "12.8";

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

type BulkPriceResponse =
  | {
      ok: true;
      successCount: number;
      failureCount: number;
      variationCount: number;
      percentChange: number;
      results: Array<{
        listingId: string;
        ok: boolean;
        variationCount?: number;
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

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function estimateListingProfit(
  listing: ActiveEbayListing,
  sellPrice: number,
  sellingFeePercent: number,
) {
  if (listing.unitCost == null) {
    return null;
  }

  return calculateEbayItemProfit({
    sellPrice,
    productCostExVat: listing.unitCost,
    ebayFeeRatePercent: sellingFeePercent,
    ebayAdsFeeRatePercent: listing.promoRatePercent ?? 0,
    postage: listing.defaultPostage ?? 0,
  });
}

function formatProfitDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoney(value)}`;
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
  const [pricePercent, setPricePercent] = useState("10");
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [sellingFeePercent, setSellingFeePercent] = useState(
    DEFAULT_SELLING_FEE_PERCENT,
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SELLING_FEE_STORAGE_KEY);
      if (stored != null && stored.trim() !== "") {
        setSellingFeePercent(stored);
      }
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }, []);

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

  const selectedWithListingId = useMemo(
    () =>
      selectedListings.filter((listing) => Boolean(listing.listingId?.trim())),
    [selectedListings],
  );

  const bulkBusy = bulkGenerating || generatingKeys.size > 0 || priceUpdating;

  const sellingFeePercentValue =
    parsePercentInput(sellingFeePercent) ??
    Number.parseFloat(DEFAULT_SELLING_FEE_PERCENT);

  const pricePercentValue = Number.parseFloat(pricePercent.trim()) || 0;

  const selectedProfitPreview = useMemo(() => {
    let currentTotal = 0;
    let projectedTotal = 0;
    let count = 0;
    let missingCost = 0;

    for (const listing of selectedWithListingId) {
      if (listing.unitCost == null || listing.price == null) {
        if (listing.unitCost == null) {
          missingCost += 1;
        }
        continue;
      }

      const current = estimateListingProfit(
        listing,
        listing.price,
        sellingFeePercentValue,
      );
      const projected = estimateListingProfit(
        listing,
        applyPricePercentChange(listing.price, pricePercentValue),
        sellingFeePercentValue,
      );

      if (!current || !projected) {
        continue;
      }

      currentTotal += current.profit;
      projectedTotal += projected.profit;
      count += 1;
    }

    return {
      currentTotal,
      projectedTotal,
      delta: projectedTotal - currentTotal,
      count,
      missingCost,
    };
  }, [selectedWithListingId, pricePercentValue, sellingFeePercentValue]);

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((listing) => selectedKeys.has(listingKey(listing)));
  const someFilteredSelected =
    filtered.some((listing) => selectedKeys.has(listingKey(listing))) &&
    !allFilteredSelected;

  function updateSellingFeePercent(value: string) {
    setSellingFeePercent(value);
    try {
      window.localStorage.setItem(SELLING_FEE_STORAGE_KEY, value);
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

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

  async function applyPriceChangeForSelected() {
    if (!selectedWithListingId.length) {
      setPriceError("Select listings with a listing ID.");
      return;
    }

    const trimmed = pricePercent.trim();
    const percentChange = Number.parseFloat(trimmed);
    if (!Number.isFinite(percentChange) || percentChange <= -100 || percentChange > 1000) {
      setPriceError("Enter a valid percent between -99.9 and 1000.");
      return;
    }

    const listingIds = selectedWithListingId
      .map((listing) => listing.listingId!.trim());

    setPriceUpdating(true);
    setPriceError(null);
    setPriceMessage(null);

    try {
      const response = await fetch("/api/ebay/listings/bulk-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingIds,
          percentChange,
        }),
      });
      const payload = (await response.json()) as BulkPriceResponse;

      if (!payload.ok) {
        setPriceError(payload.error);
        return;
      }

      const failures = payload.results.filter((result) => !result.ok);
      if (payload.successCount > 0) {
        await loadListings();
        setSelectedKeys(new Set());
      }

      if (payload.successCount === 0) {
        setPriceError(
          failures
            .map((result) => `${result.listingId}: ${result.error ?? "Failed"}`)
            .join(" · "),
        );
        return;
      }

      const sign = percentChange > 0 ? "+" : "";
      let message = `Updated ${payload.variationCount} price${payload.variationCount === 1 ? "" : "s"} across ${payload.successCount} listing${payload.successCount === 1 ? "" : "s"} (${sign}${percentChange}%).`;
      if (failures.length > 0) {
        message += ` ${failures.length} failed.`;
      }
      setPriceMessage(message);
    } catch {
      setPriceError("Could not reach the bulk price endpoint.");
    } finally {
      setPriceUpdating(false);
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

      {priceMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>{priceMessage}</p>
        </div>
      ) : null}
      {priceError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {priceError}
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
                  disabled={bulkBusy}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="active-selling-fee" className="sr-only">
                  Selling fee percent
                </label>
                <div className="relative">
                  <Input
                    id="active-selling-fee"
                    value={sellingFeePercent}
                    onChange={(event) =>
                      updateSellingFeePercent(event.target.value)
                    }
                    placeholder="12.8"
                    inputMode="decimal"
                    className="w-24 pr-7 text-right tabular-nums"
                    disabled={bulkBusy}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="ebay-price-percent" className="sr-only">
                  Price change percent
                </label>
                <div className="relative">
                  <Input
                    id="ebay-price-percent"
                    value={pricePercent}
                    onChange={(event) => setPricePercent(event.target.value)}
                    placeholder="10"
                    inputMode="decimal"
                    className="w-24 pr-7 text-right tabular-nums"
                    disabled={bulkBusy}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void applyPriceChangeForSelected()}
                disabled={bulkBusy || selectedWithListingId.length === 0}
              >
                {priceUpdating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Updating prices…
                  </>
                ) : (
                  <>
                    <Percent className="size-4" />
                    Apply price
                    {selectedWithListingId.length > 0
                      ? ` (${selectedWithListingId.length})`
                      : ""}
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void generateSkuForSelected()}
                disabled={
                  bulkBusy ||
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadListings()}
                disabled={bulkBusy}
              >
                Refresh
              </Button>
            </div>
          </div>
          {selectedWithListingId.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
              <p className="text-muted-foreground">
                {selectedWithListingId.length} selected · apply{" "}
                {pricePercent.trim() || "0"}% to all variation prices on each
                listing (e.g. £10 → £
                {(
                  10 *
                  (1 + (Number.parseFloat(pricePercent) || 0) / 100)
                ).toFixed(2)}
                )
              </p>
              {selectedProfitPreview.count > 0 ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                  <span>
                    Est. profit now:{" "}
                    <span className="font-medium text-foreground">
                      {formatMoney(selectedProfitPreview.currentTotal)}
                    </span>
                  </span>
                  <span>
                    After {pricePercent.trim() || "0"}%:{" "}
                    <span className="font-medium text-foreground">
                      {formatMoney(selectedProfitPreview.projectedTotal)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      selectedProfitPreview.delta > 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : selectedProfitPreview.delta < 0
                          ? "text-red-700 dark:text-red-300"
                          : "text-foreground",
                    )}
                  >
                    {formatProfitDelta(selectedProfitPreview.delta)} per unit
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Set unit costs on the Products page to see profit estimates.
                </p>
              )}
              {selectedProfitPreview.missingCost > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {selectedProfitPreview.missingCost} selected listing
                  {selectedProfitPreview.missingCost === 1 ? "" : "s"} missing
                  unit cost — profit preview uses{" "}
                  {selectedProfitPreview.count} listing
                  {selectedProfitPreview.count === 1 ? "" : "s"} with cost set.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Profit uses selling fee {sellingFeePercentValue}%, promo rate
                per listing, and default postage from Products.
              </p>
            </div>
          ) : null}
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
                    <TableHead className="w-[22%]">Listing</TableHead>
                    <TableHead className="w-[12%]">SKU</TableHead>
                    <TableHead className="w-[10%]">Listing ID</TableHead>
                    <TableHead className="w-[8%] text-right">Price</TableHead>
                    <TableHead className="w-[8%] text-right">Est. profit</TableHead>
                    <TableHead className="w-[8%] text-right">Promo</TableHead>
                    <TableHead className="w-[6%] text-right">Qty</TableHead>
                    <TableHead className="w-[8%]">Status</TableHead>
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
                    const profitEstimate =
                      listing.price != null
                        ? estimateListingProfit(
                            listing,
                            listing.price,
                            sellingFeePercentValue,
                          )
                        : null;
                    const projectedProfit =
                      listing.price != null && pricePercentValue !== 0
                        ? estimateListingProfit(
                            listing,
                            applyPricePercentChange(
                              listing.price,
                              pricePercentValue,
                            ),
                            sellingFeePercentValue,
                          )
                        : null;

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
                        {profitEstimate ? (
                          <div className="space-y-0.5 tabular-nums">
                            <p className="font-medium">
                              {formatMoney(profitEstimate.profit)}
                            </p>
                            {selectedKeys.has(key) &&
                            projectedProfit &&
                            pricePercentValue !== 0 ? (
                              <p
                                className={cn(
                                  "text-xs",
                                  projectedProfit.profit - profitEstimate.profit >
                                    0
                                    ? "text-emerald-700 dark:text-emerald-300"
                                    : projectedProfit.profit -
                                          profitEstimate.profit <
                                        0
                                      ? "text-red-700 dark:text-red-300"
                                      : "text-muted-foreground",
                                )}
                              >
                                → {formatMoney(projectedProfit.profit)}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {listing.unitCost == null ? "No cost" : "—"}
                          </span>
                        )}
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
                            disabled={isGenerating || bulkBusy}
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
        listings and use Apply price to change all variation prices by a
        percentage, Generate SKU to assign seller SKUs, or click a listing to
        edit individually.
      </p>
    </div>
  );
}
