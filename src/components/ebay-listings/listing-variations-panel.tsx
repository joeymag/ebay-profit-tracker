"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EbayListingDetails } from "@/lib/ebay/listing-details";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type DetailsResponse =
  | { ok: true; listing: EbayListingDetails }
  | { ok: false; error: string; code?: string; details?: string };

function formatPrice(
  price: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (price == null) {
    return "—";
  }

  return formatMoney(price, currency ?? "GBP");
}

function formatQty(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
}

type ListingVariationsPanelProps = {
  listingId: string;
};

export function ListingVariationsPanel({ listingId }: ListingVariationsPanelProps) {
  const [listing, setListing] = useState<EbayListingDetails | null>(null);
  const [error, setError] = useState<Extract<DetailsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/details`,
      );
      const payload = (await response.json()) as DetailsResponse;

      if (!payload.ok) {
        setListing(null);
        setError(payload);
        return;
      }

      setListing(payload.listing);
    } catch {
      setListing(null);
      setError({
        ok: false,
        error: "Could not reach the listing details endpoint.",
      });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockTotal = useMemo(() => {
    if (!listing) {
      return 0;
    }

    return listing.variations.reduce(
      (sum, row) => sum + (row.quantityAvailable ?? 0),
      0,
    );
  }, [listing]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading variations from eBay…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load listing</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/ebay-listings" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to listings
            </Link>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
          {error.details ? (
            <p className="font-mono text-xs text-muted-foreground">{error.details}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/ebay-listings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="size-4" />
          All listings
        </Link>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
        <a
          href={listing.itemWebUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Open on eBay
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <Card className="surface-card">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap gap-4">
            <LineItemImage
              src={listing.imageUrl}
              alt={listing.title ?? listing.listingId}
              className="size-20"
            />
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-xl leading-snug">
                {listing.title ?? `Listing ${listing.listingId}`}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{listing.listingId}</span>
                {listing.isMultiVariation ? (
                  <Badge variant="secondary">
                    {listing.variations.length} variations
                  </Badge>
                ) : (
                  <Badge variant="outline">Single SKU</Badge>
                )}
                {listing.status ? (
                  <Badge variant="outline">
                    {listing.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ) : null}
              </CardDescription>
              <p className="text-sm text-muted-foreground">
                Total available stock across rows:{" "}
                <span className="tabular-nums text-foreground">
                  {stockTotal.toLocaleString("en-GB")}
                </span>
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle>
            {listing.isMultiVariation ? "Variations" : "Listing stock"}
          </CardTitle>
          <CardDescription>
            SKU, price, and quantity from eBay Seller Hub (Trading API GetItem)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%] pl-6">Variation</TableHead>
                  <TableHead className="w-[22%]">SKU</TableHead>
                  <TableHead className="w-[14%] text-right">Price</TableHead>
                  <TableHead className="w-[12%] text-right">Available</TableHead>
                  <TableHead className="w-[12%] text-right">Sold</TableHead>
                  <TableHead className="w-[12%] pr-6 text-right">Listed qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.variations.map((row, index) => (
                  <TableRow key={`${row.sku ?? "nosku"}-${index}`}>
                    <TableCell className="min-w-0 whitespace-normal pl-6 align-top">
                      <p className="break-words text-sm font-medium leading-snug">
                        {row.specifics || "—"}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-0 align-top whitespace-normal">
                      {row.sku ? (
                        <Badge
                          variant="outline"
                          className="max-w-full truncate bg-background font-mono text-sm font-medium"
                          title={row.sku}
                        >
                          {row.sku}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top">
                      {formatPrice(row.price, row.currency ?? listing.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top font-medium">
                      {formatQty(row.quantityAvailable)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top text-muted-foreground">
                      {formatQty(row.quantitySold)}
                    </TableCell>
                    <TableCell className="pr-6 text-right tabular-nums align-top text-muted-foreground">
                      {formatQty(row.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
