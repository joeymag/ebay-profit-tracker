"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

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
import {
  ebayListingUrl,
  formatPercent,
  type ListingTrafficReport,
} from "@/lib/ebay/traffic-report-types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type TrafficApiResponse =
  | { ok: true; report: ListingTrafficReport }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: string;
    };

function formatCount(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
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

function availabilityBadge(status: string | null | undefined) {
  if (!status) {
    return null;
  }

  const normalized = status.toUpperCase();
  if (normalized === "OUT_OF_STOCK") {
    return <Badge variant="destructive">Out of stock</Badge>;
  }

  if (normalized === "IN_STOCK") {
    return <Badge variant="secondary">In stock</Badge>;
  }

  return <Badge variant="outline">{status.replaceAll("_", " ").toLowerCase()}</Badge>;
}

export function EbayAnalyticsPanel() {
  const searchParams = useSearchParams();
  const range = searchParams.get("range") ?? "30days";
  const [report, setReport] = useState<ListingTrafficReport | null>(null);
  const [error, setError] = useState<TrafficApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/ebay/analytics/traffic?range=${encodeURIComponent(range)}`,
      );
      const data = (await response.json()) as TrafficApiResponse;

      if (!data.ok) {
        setReport(null);
        setError(data);
        return;
      }

      setReport(data.report);
    } catch {
      setReport(null);
      setError({
        ok: false,
        error: "Could not reach the eBay analytics endpoint.",
      });
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading listing traffic and product details from eBay…
      </div>
    );
  }

  if (error && !error.ok) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load eBay analytics</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error.code === "SCOPE_REQUIRED" || error.code === "NOT_CONNECTED" ? (
            <Link href="/settings" className={cn(buttonVariants())}>
              Go to Settings
            </Link>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void loadReport()}>
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

  if (!report) {
    return null;
  }

  const totals = report.listings.reduce(
    (acc, row) => ({
      searchImpressions: acc.searchImpressions + (row.searchImpressions ?? 0),
      views: acc.views + (row.views ?? 0),
      transactions: acc.transactions + (row.transactions ?? 0),
    }),
    { searchImpressions: 0, views: 0, transactions: 0 },
  );

  const avgCtr =
    totals.searchImpressions > 0
      ? totals.views / totals.searchImpressions
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Search impressions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCount(totals.searchImpressions)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Times listings appeared in search results
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Total views</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCount(totals.views)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Buyers opened your listing pages
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Click-through rate</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatPercent(avgCtr)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Views ÷ search impressions (portfolio average)
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader className="pb-2">
            <CardDescription>Purchases</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatCount(totals.transactions)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Transactions attributed in the report period
          </CardContent>
        </Card>
      </div>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Listing performance</CardTitle>
              <CardDescription>
                {report.rangeLabel} · {report.marketplaceId} · up to 200 listings
                with photos and prices · sorted by views
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.lastUpdatedDate ? (
                <Badge variant="outline">
                  Updated{" "}
                  {new Date(report.lastUpdatedDate).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Badge>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => void loadReport()}>
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {report.listings.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No listing traffic returned for this period. Try a wider date range
              or confirm your eBay account has active listings.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Search impr.</TableHead>
                  <TableHead className="text-right">All impr.</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.listings.map((row) => (
                  <TableRow key={row.listingId}>
                    <TableCell className="max-w-sm">
                      <div className="flex gap-3">
                        <LineItemImage
                          src={row.imageUrl}
                          alt={row.title ?? row.listingId}
                          className="size-14"
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="line-clamp-2 font-medium leading-snug">
                            {row.title ?? `Listing ${row.listingId}`}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {row.sku ? (
                              <span className="font-mono text-xs text-muted-foreground">
                                SKU {row.sku}
                              </span>
                            ) : null}
                            {row.condition ? (
                              <span className="text-xs text-muted-foreground">
                                {row.condition}
                              </span>
                            ) : null}
                            {availabilityBadge(row.availabilityStatus)}
                          </div>
                          <a
                            href={row.itemWebUrl ?? ebayListingUrl(row.listingId, report.marketplaceId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {row.listingId}
                            <ExternalLink className="size-3" />
                          </a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(row.price, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantityAvailable != null
                        ? row.quantityAvailable.toLocaleString("en-GB")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.searchImpressions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.allImpressions ?? row.totalImpressions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.views)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.clickThroughRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCount(row.transactions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(row.salesConversionRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {report.warnings.length ? (
        <Card className="surface-card border-amber-300/60">
          <CardHeader>
            <CardTitle className="text-base">Report notes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {report.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Listing photos, prices, and stock come from the eBay Browse API (public
        listing data). eBay does not expose search rank position (e.g. #3 in
        results). These metrics show visibility (impressions), engagement
        (views, CTR), and conversion instead.
      </p>
    </div>
  );
}
