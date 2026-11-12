"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";

import { AmazonListingEditor } from "@/components/amazon-listings/amazon-listing-editor";
import { LineItemImage } from "@/components/orders/line-item-image";
import { ProductCostInput } from "@/components/products/product-cost-input";
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
import type { AmazonListingFamily } from "@/lib/amazon/listing-editor";
import {
  effectiveAmazonListingImageUrl,
  type AmazonListing,
} from "@/lib/amazon/listings-shared";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type ListingRow = AmazonListing & {
  unitCost?: number | null;
  defaultPostage?: number | null;
  parentSku?: string | null;
  parentage?: "parent" | "child" | "standalone";
};

type FamilyRow = Omit<AmazonListingFamily, "members"> & {
  members: ListingRow[];
};

type ListingsResponse =
  | {
      ok: true;
      marketplaceId: string;
      count: number;
      listings: ListingRow[];
      families: FamilyRow[];
      familyCount: number;
      relationshipsLoaded: boolean;
      fetchedAt: string;
      cached: boolean;
      source?: "database" | "live" | "supabase";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Inline editor SKU — keeps the grid page mounted (no route change). */
  const [editingSku, setEditingSku] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      // GET /api/amazon/listings reads Supabase; ?refresh=1 re-runs full backfill.
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

  const families = useMemo(() => {
    const rows = data?.families ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((family) => {
      const hay = [
        family.title,
        family.parentSku,
        family.groupId,
        ...family.members.flatMap((member) => [
          member.title,
          member.sku,
          member.asin,
          member.listingId,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data?.families, search]);

  const toggleExpanded = (groupId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const patchMemberCost = (
    sku: string,
    patch: Partial<Pick<ListingRow, "unitCost" | "defaultPostage">>,
  ) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        listings: current.listings.map((listing) =>
          listing.sku === sku ? { ...listing, ...patch } : listing,
        ),
        families: current.families.map((family) => ({
          ...family,
          members: family.members.map((member) =>
            member.sku === sku ? { ...member, ...patch } : member,
          ),
        })),
      };
    });
  };

  if (editingSku) {
    return (
      <AmazonListingEditor
        sku={editingSku}
        onBack={() => {
          setEditingSku(null);
          void load(false);
        }}
      />
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading Amazon listings (variations may take a moment)…
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
            <Link
              href="/settings"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
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
          <Badge variant="outline">{data?.familyCount ?? 0} groups</Badge>
          {data?.cached ? <Badge variant="secondary">Cached</Badge> : null}
          {data?.relationshipsLoaded ? (
            <Badge variant="secondary">Variations grouped</Badge>
          ) : (
            <Badge variant="outline">Flat view</Badge>
          )}
          {data?.source === "database" || data?.source === "supabase" ? (
            <Badge variant="secondary">Supabase</Badge>
          ) : null}
          {data?.env ? <Badge variant="outline">{data.env}</Badge> : null}
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

      {families.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No listings match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Listing</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>ASIN</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Cost of goods</TableHead>
                <TableHead>Postage</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.map((family) => {
                const parent =
                  family.members.find((member) => member.parentage === "parent") ??
                  family.members.find(
                    (member) =>
                      family.parentSku != null &&
                      member.sku === family.parentSku,
                  ) ??
                  null;
                const head = parent ?? family.members[0] ?? null;
                if (!head) return null;
                const children = family.members.filter(
                  (member) => member.sku !== head.sku,
                );
                const hasChildren = children.length > 0;
                const isOpen = expanded.has(family.groupId);
                const headImage =
                  effectiveAmazonListingImageUrl(head.imageUrl) ||
                  effectiveAmazonListingImageUrl(family.imageUrl) ||
                  children
                    .map((member) =>
                      effectiveAmazonListingImageUrl(member.imageUrl),
                    )
                    .find(Boolean) ||
                  null;
                const headRow =
                  headImage && headImage !== head.imageUrl
                    ? { ...head, imageUrl: headImage }
                    : { ...head, imageUrl: headImage };

                return (
                  <Fragment key={family.groupId}>
                    <TableRow
                      className={cn(
                        "cursor-pointer",
                        hasChildren ? "bg-muted/20" : undefined,
                      )}
                      onClick={() => {
                        if (hasChildren && !isOpen) {
                          toggleExpanded(family.groupId);
                        }
                        if (headRow.sku) setEditingSku(headRow.sku);
                      }}
                    >
                      <TableCell className="pr-0">
                        {hasChildren ? (
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen
                                ? "Collapse variations"
                                : "Expand variations"
                            }
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpanded(family.groupId);
                            }}
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        ) : null}
                      </TableCell>
                      <ListingCells
                        row={headRow}
                        titleOverride={
                          hasChildren
                            ? `${family.title} · ${children.length} variation${children.length === 1 ? "" : "s"}`
                            : undefined
                        }
                        badge={hasChildren ? "Parent" : null}
                        onCostSaved={patchMemberCost}
                        onEdit={(sku) => setEditingSku(sku)}
                      />
                    </TableRow>

                    {hasChildren && isOpen
                      ? children.map((child) => (
                          <TableRow
                            key={`${family.groupId}-${child.sku}`}
                            className="cursor-pointer bg-background"
                            onClick={() => {
                              if (child.sku) setEditingSku(child.sku);
                            }}
                          >
                            <TableCell className="pr-0" />
                            <ListingCells
                              row={child}
                              indented
                              badge="Variation"
                              onCostSaved={patchMemberCost}
                              onEdit={(sku) => setEditingSku(sku)}
                            />
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data?.fetchedAt ? (
        <p className="text-xs text-muted-foreground">
          Last fetched {new Date(data.fetchedAt).toLocaleString()}
          {data.cached ? " (from cache)" : ""}. Click a listing to edit it here
          without leaving this page. Pencil opens the same inline editor;
          `/amazon-listings/[sku]` still works as a direct link.
        </p>
      ) : null}
    </div>
  );
}

function ListingCells({
  row,
  titleOverride,
  badge,
  indented,
  onCostSaved,
  onEdit,
}: {
  row: ListingRow;
  titleOverride?: string;
  badge?: string | null;
  indented?: boolean;
  onCostSaved: (
    sku: string,
    patch: Partial<Pick<ListingRow, "unitCost" | "defaultPostage">>,
  ) => void;
  onEdit: (sku: string) => void;
}) {
  return (
    <>
      <TableCell>
        <LineItemImage
          src={effectiveAmazonListingImageUrl(row.imageUrl)}
          alt={row.title}
          className={cn(
            "rounded-md object-cover",
            indented ? "ml-4 size-9" : "size-10",
          )}
        />
      </TableCell>
      <TableCell>
        <div className={cn("max-w-[420px]", indented && "pl-4")}>
          <div className="flex flex-wrap items-start gap-2">
            <p
              className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-snug"
              title={titleOverride || row.title}
            >
              {titleOverride || row.title}
            </p>
            {badge ? <Badge variant="outline">{badge}</Badge> : null}
          </div>
          {row.condition ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Condition: {row.condition}
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.sku || "—"}</TableCell>
      <TableCell className="font-mono text-xs">{row.asin || "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.price != null ? formatMoney(row.price) : "—"}
      </TableCell>
      <TableCell
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {row.sku ? (
          <ProductCostInput
            sku={row.sku}
            initialCost={row.unitCost ?? null}
            onSaved={(unitCost) => onCostSaved(row.sku, { unitCost })}
          />
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {row.sku ? (
          <ProductCostInput
            sku={row.sku}
            field="defaultPostage"
            initialCost={row.defaultPostage ?? null}
            onSaved={(defaultPostage) =>
              onCostSaved(row.sku, { defaultPostage })
            }
          />
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.quantity != null ? row.quantity : "—"}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {fulfillmentLabel(row.fulfillmentChannel)}
        </Badge>
      </TableCell>
      <TableCell onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-1">
          {row.sku ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Edit listing"
              onClick={() => onEdit(row.sku)}
            >
              <Pencil className="size-3.5" />
            </Button>
          ) : null}
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
        </div>
      </TableCell>
    </>
  );
}
