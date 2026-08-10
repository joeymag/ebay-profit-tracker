"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";

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
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: string;
    };

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (price == null) {
    return "—";
  }

  return formatMoney(price, currency ?? "GBP");
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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [data, query]);

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
            <CardDescription>With SKU</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.listings
                .filter((listing) => listing.sku && listing.sku !== listing.listingId)
                .length.toLocaleString("en-GB")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Seller SKU set on the listing
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Source</CardDescription>
            <CardTitle className="text-2xl">Seller Hub</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Trading API · same eBay login as fee sync
          </CardContent>
        </Card>
      </div>

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
                    <TableHead className="w-16 pl-6" />
                    <TableHead className="w-[34%]">Listing</TableHead>
                    <TableHead className="w-[16%]">SKU</TableHead>
                    <TableHead className="w-[14%]">Listing ID</TableHead>
                    <TableHead className="w-[12%] text-right">Price</TableHead>
                    <TableHead className="w-[10%] text-right">Qty</TableHead>
                    <TableHead className="w-[10%] pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((listing) => {
                    const detailHref = listing.listingId
                      ? `/ebay-listings/${encodeURIComponent(listing.listingId)}`
                      : null;

                    return (
                    <TableRow
                      key={`${listing.sku}-${listing.offerId ?? listing.listingId}`}
                      className={detailHref ? "cursor-pointer hover:bg-muted/40" : undefined}
                    >
                      <TableCell className="pl-6 align-top">
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
                          className="max-w-full truncate bg-background font-mono text-sm font-medium"
                          title={listing.sku}
                        >
                          {listing.sku}
                        </Badge>
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
                      <TableCell className="text-right tabular-nums align-top">
                        {listing.quantity != null
                          ? listing.quantity.toLocaleString("en-GB")
                          : "—"}
                      </TableCell>
                      <TableCell className="pr-6 align-top">
                        <Badge variant="secondary">
                          {listing.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
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
        Loads classic Seller Hub active listings via the Trading API, using the
        same connected eBay account as fee sync. Click a listing to see all
        variations with SKU, price, and stock.
      </p>
    </div>
  );
}
