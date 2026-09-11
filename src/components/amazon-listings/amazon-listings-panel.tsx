"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";

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
import type { AmazonListing } from "@/lib/amazon/listings";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ListingsResponse =
  | {
      ok: true;
      marketplaceId: string;
      count: number;
      listings: AmazonListing[];
      fetchedAt: string;
      cached: boolean;
      env?: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      details?: string;
    };

function fulfillmentLabel(channel: string | null): string {
  if (!channel) return "—";
  const upper = channel.toUpperCase();
  if (upper === "DEFAULT" || upper.includes("DEFAULT")) return "MFN";
  if (upper.includes("AMAZON")) return "FBA";
  return channel;
}

export function AmazonListingsPanel() {
  const [data, setData] = useState<Extract<ListingsResponse, { ok: true }> | null>(
    null,
  );
  const [error, setError] = useState<Extract<ListingsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/amazon/listings${forceRefresh ? "?refresh=1" : ""}`,
      );
      const json = (await res.json()) as ListingsResponse;
      if (!json.ok) {
        setData(null);
        setError(json);
        return;
      }
      setData(json);
    } catch {
      setData(null);
      setError({ ok: false, error: "Could not reach the Amazon listings API." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const filtered = useMemo(() => {
    const listings = data?.listings ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return listings;
    return listings.filter((row) => {
      const hay = [row.title, row.sku, row.asin, row.listingId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data?.listings, search]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Amazon listings (report can take up to a minute)…
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load Amazon listings</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void load(true)}>
            Retry
          </Button>
          {error.code === "NOT_CONNECTED" || error.code === "NOT_CONFIGURED" ? (
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline" }))}>
              Open Settings
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{data?.count ?? 0} listings</Badge>
          {data?.cached ? <Badge variant="secondary">Cached</Badge> : null}
          {data?.env ? <Badge variant="outline">{data.env}</Badge> : null}
          {data?.marketplaceId ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {data.marketplaceId}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search title, SKU, ASIN…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => void load(true)}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" />
                Refreshing…
              </>
            ) : (
              <>
                <RefreshCw />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No listings match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>ASIN</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={`${row.listingId}-${row.sku}`}>
                  <TableCell>
                    <LineItemImage
                      src={row.imageUrl}
                      alt={row.title}
                      className="size-10 rounded-md object-cover"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[360px]">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {row.title}
                      </p>
                      {row.condition ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Condition: {row.condition}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.sku || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.asin || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.price != null ? formatMoney(row.price) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity != null ? row.quantity : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {fulfillmentLabel(row.fulfillmentChannel)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.productUrl ? (
                      <a
                        href={row.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon-sm" }),
                        )}
                        title="Open on Amazon"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data?.fetchedAt ? (
        <p className="text-xs text-muted-foreground">
          Last fetched {new Date(data.fetchedAt).toLocaleString()}
          {data.cached ? " (from cache)" : ""}. Open listings report from Amazon
          Seller Central data for the configured marketplace.
        </p>
      ) : null}
    </div>
  );
}
