"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Loader2, RefreshCw, ScanBarcode, Sparkles } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { MasterChildConfigPanel } from "@/components/inventory-map/master-child-config-panel";
import { ReorderBadge } from "@/components/stock/reorder-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  childSellableUnits,
  type InventoryMasterWithChildren,
} from "@/lib/inventory/master-child-types";
import type {
  InventoryMapItem,
  InventoryMapSummary,
} from "@/lib/shopify/inventory";
import { cn } from "@/lib/utils";

type InventoryMapResponse =
  | {
      ok: true;
      count: number;
      summary: InventoryMapSummary;
      items: InventoryMapItem[];
    }
  | { ok: false; error: string };

type MastersResponse =
  | { ok: true; masters: InventoryMasterWithChildren[] }
  | { ok: false; error: string };

type EnrichedItem = InventoryMapItem & {
  displayStock: number;
  stockLabel: string;
  masterInfo?: InventoryMasterWithChildren;
  childPiecesPerUnit?: number;
};

type StockFilter = "all" | "in-stock" | "out-of-stock" | "low-stock" | "has-sku" | "no-sku";

const filterLabels: Record<StockFilter, string> = {
  all: "All",
  "in-stock": "In stock",
  "out-of-stock": "Out of stock",
  "low-stock": "Low (1–5)",
  "has-sku": "Has SKU",
  "no-sku": "No SKU",
};

function stockTone(available: number): string {
  if (available <= 0) {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (available <= 5) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function SummaryStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function InventoryMapClient() {
  const [items, setItems] = useState<InventoryMapItem[]>([]);
  const [masters, setMasters] = useState<InventoryMasterWithChildren[]>([]);
  const [summary, setSummary] = useState<InventoryMapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [generatingVariantId, setGeneratingVariantId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [mapRes, mastersRes] = await Promise.all([
        fetch("/api/shopify/inventory/map"),
        fetch("/api/inventory/masters"),
      ]);
      const data = (await mapRes.json()) as InventoryMapResponse;
      const mastersData = (await mastersRes.json()) as MastersResponse;

      if (!data.ok) {
        setError(data.error);
        setItems([]);
        setSummary(null);
        return;
      }

      setItems(data.items);
      setSummary(data.summary);
      setMasters(mastersData.ok ? mastersData.masters : []);
    } catch {
      setError("Could not load inventory map.");
      setItems([]);
      setSummary(null);
      setMasters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshKey]);

  const masterBySku = useMemo(() => {
    return new Map(masters.map((master) => [master.sku.toUpperCase(), master]));
  }, [masters]);

  const childMappingBySku = useMemo(() => {
    const map = new Map<
      string,
      { mapping: InventoryMasterWithChildren["children"][number]; master: InventoryMasterWithChildren }
    >();
    for (const master of masters) {
      for (const child of master.children) {
        map.set(child.childSku.toUpperCase(), { mapping: child, master });
      }
    }
    return map;
  }, [masters]);

  const enrichedItems = useMemo((): EnrichedItem[] => {
    return items.map((item) => {
      const skuKey = item.sku?.toUpperCase() ?? "";
      const master = skuKey ? masterBySku.get(skuKey) : undefined;
      const childLink = skuKey ? childMappingBySku.get(skuKey) : undefined;

      if (master) {
        return {
          ...item,
          displayStock: Math.floor(master.piecesOnHand),
          stockLabel: `${Math.floor(master.piecesOnHand).toLocaleString()} pc (${Math.floor(master.piecesOnHand / master.packSize)} boxes)`,
          masterInfo: master,
        };
      }

      if (childLink) {
        const sellable = childSellableUnits(
          childLink.master.piecesOnHand,
          childLink.mapping.piecesPerUnit,
        );
        return {
          ...item,
          displayStock: sellable,
          stockLabel: `${sellable.toLocaleString()} sellable (${childLink.mapping.piecesPerUnit} pc/unit)`,
          childPiecesPerUnit: childLink.mapping.piecesPerUnit,
          masterInfo: childLink.master,
        };
      }

      return {
        ...item,
        displayStock: item.available,
        stockLabel: `${item.available} in stock`,
      };
    });
  }, [childMappingBySku, items, masterBySku]);

  async function generateSku(variantId: number) {
    setGeneratingVariantId(variantId);
    setActionMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/shopify/inventory/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      const data = (await res.json()) as
        | { ok: true; sku: string }
        | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setActionMessage(`Assigned SKU ${data.sku}.`);
      setRefreshKey((value) => value + 1);
    } catch {
      setError("Could not generate SKU.");
    } finally {
      setGeneratingVariantId(null);
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return enrichedItems.filter((item) => {
      if (filter === "in-stock" && item.displayStock <= 0) {
        return false;
      }
      if (filter === "out-of-stock" && item.displayStock > 0) {
        return false;
      }
      if (filter === "low-stock" && !(item.displayStock > 0 && item.displayStock <= 5)) {
        return false;
      }
      if (filter === "has-sku" && !item.sku) {
        return false;
      }
      if (filter === "no-sku" && item.sku) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        item.displayName.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.productTitle.toLowerCase().includes(query)
      );
    });
  }, [enrichedItems, filter, search]);

  return (
    <div className="flex flex-col gap-6">
      <MasterChildConfigPanel onChanged={() => setRefreshKey((value) => value + 1)} />

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="Tracked variants"
            value={summary.totalTracked}
            hint={`${summary.withSku} with SKU · ${summary.withoutSku} without`}
          />
          <SummaryStat label="In stock" value={summary.inStock} />
          <SummaryStat label="Out of stock" value={summary.outOfStock} />
          <SummaryStat
            label="Low stock"
            value={summary.lowStock}
            hint="1–5 units available"
          />
        </div>
      ) : null}

      <Card className="surface-card">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="size-5 text-primary" />
              Inventory map
            </CardTitle>
            <CardDescription>
              Live stock from Shopify for every tracked variant. Search by product
              or SKU, then update quantities on{" "}
              <Link href="/stock" className="text-primary hover:underline">
                Stock control
              </Link>
              .
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadItems()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Input
              placeholder="Search product or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(filterLabels) as StockFilter[]).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                >
                  {filterLabels[key]}
                </Button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {actionMessage ? (
            <p className="text-sm text-muted-foreground">{actionMessage}</p>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              No variants match your filters.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => (
                <div
                  key={item.variantId}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm"
                >
                  <div className="flex gap-3">
                    <LineItemImage
                      src={item.imageUrl}
                      alt={item.displayName}
                      className="size-14 shrink-0 rounded-lg"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {item.displayName}
                      </p>
                      {item.sku ? (
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No SKU</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("font-mono tabular-nums", stockTone(item.displayStock))}
                    >
                      {item.stockLabel}
                    </Badge>
                    {item.masterInfo && item.sku?.toUpperCase() !== item.masterInfo.sku.toUpperCase() ? (
                      <Badge variant="outline" className="text-xs">
                        Master: {item.masterInfo.sku} ·{" "}
                        {Math.floor(item.masterInfo.piecesOnHand).toLocaleString()} pc
                      </Badge>
                    ) : null}
                    {item.masterInfo && item.sku?.toUpperCase() === item.masterInfo.sku.toUpperCase() ? (
                      <Badge variant="outline" className="text-xs">
                        Master SKU
                      </Badge>
                    ) : null}
                    {item.childPiecesPerUnit ? (
                      <Badge variant="outline" className="text-xs">
                        Child · {item.childPiecesPerUnit} pc/order unit
                      </Badge>
                    ) : null}
                    <ReorderBadge sales={item} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>30d sold: {item.unitsSold30Days}</span>
                    <span>90d sold: {item.unitsSold90Days}</span>
                  </div>

                  {item.sku ? (
                    <Button
                      render={<Link href="/stock" />}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <ScanBarcode className="size-4" />
                      Update in Stock control
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={generatingVariantId === item.variantId}
                      onClick={() => void generateSku(item.variantId)}
                    >
                      {generatingVariantId === item.variantId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Generate SKU
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && filteredItems.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {filteredItems.length} of {items.length} tracked variants
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
