"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGrid, Loader2, RefreshCw, ScanBarcode } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { MasterChildConfigPanel } from "@/components/inventory-map/master-child-config-panel";
import {
  ProductConfigGroup,
  type ProductConfigGroupData,
} from "@/components/inventory-map/product-config-group";
import { SingleVariantMapping } from "@/components/inventory-map/single-variant-mapping";
import {
  VariantSkuAssign,
  type PendingVariantIdentifiers,
} from "@/components/inventory-map/variant-sku-assign";
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

type StockFilter =
  | "all"
  | "config-products"
  | "in-stock"
  | "out-of-stock"
  | "low-stock"
  | "has-sku"
  | "no-sku";

const filterLabels: Record<StockFilter, string> = {
  all: "All",
  "config-products": "Config products",
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
  const [pendingByVariantId, setPendingByVariantId] = useState<
    Record<number, PendingVariantIdentifiers>
  >({});
  const [savingPendingSkus, setSavingPendingSkus] = useState(false);

  const pendingCount = Object.keys(pendingByVariantId).length;

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

  const masterBoxesBySku = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (!item.sku) {
        continue;
      }
      const key = item.sku.toUpperCase();
      map.set(key, Math.max(map.get(key) ?? 0, item.available));
    }
    return map;
  }, [items]);

  const enrichedItems = useMemo((): EnrichedItem[] => {
    return items.map((item) => {
      const skuKey = item.sku?.toUpperCase() ?? "";
      const master = skuKey ? masterBySku.get(skuKey) : undefined;
      const childLink = skuKey ? childMappingBySku.get(skuKey) : undefined;

      if (master) {
        const boxes = masterBoxesBySku.get(skuKey) ?? item.available;
        const pieces = boxes * master.packSize;
        return {
          ...item,
          displayStock: Math.floor(pieces),
          stockLabel: `${Math.floor(pieces).toLocaleString()} pc (${boxes} boxes)`,
          masterInfo: master,
        };
      }

      if (childLink) {
        const masterSkuKey = childLink.master.sku.toUpperCase();
        const masterBoxes = masterBoxesBySku.get(masterSkuKey) ?? 0;
        const masterPieces = masterBoxes * childLink.master.packSize;
        const sellable = childSellableUnits(
          masterPieces,
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
  }, [childMappingBySku, items, masterBoxesBySku, masterBySku]);

  const catalogMasters = useMemo(() => {
    const seen = new Set<string>();
    const options: { sku: string; label: string; packSize: number }[] = [];

    for (const item of enrichedItems) {
      const sku = item.sku?.trim();
      if (!sku) {
        continue;
      }
      const key = sku.toUpperCase();
      const master = masterBySku.get(key);
      if (!master || seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push({
        sku,
        label: item.displayName,
        packSize: master.packSize,
      });
    }

    return options;
  }, [enrichedItems, masterBySku]);

  async function assignVariantIdentifiers(
    variantId: number,
    options?: { refresh?: boolean; sku?: string; barcode?: string },
  ): Promise<{ sku: string | null; barcode: string | null } | null> {
    setGeneratingVariantId(variantId);
    setError(null);

    try {
      const body: {
        variantId: number;
        sku?: string;
        barcode?: string;
      } = { variantId };

      if (options?.sku?.trim()) {
        body.sku = options.sku.trim();
      }
      if (options?.barcode?.trim()) {
        body.barcode = options.barcode.trim();
      } else if (options?.sku?.trim()) {
        body.barcode = options.sku.trim();
      }

      const res = await fetch("/api/shopify/inventory/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as
        | { ok: true; sku: string | null; barcode: string | null }
        | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        return null;
      }

      if (options?.refresh) {
        const label = data.sku ?? data.barcode ?? "variant";
        setActionMessage(`Updated ${label} on Shopify.`);
        setRefreshKey((value) => value + 1);
      }

      return { sku: data.sku, barcode: data.barcode };
    } catch {
      setError("Could not save SKU or barcode to Shopify.");
      return null;
    } finally {
      setGeneratingVariantId(null);
    }
  }

  async function suggestSku(prefix = "INV"): Promise<string | null> {
    try {
      const res = await fetch(
        `/api/shopify/inventory/generate-sku?prefix=${encodeURIComponent(prefix)}`,
      );
      const data = (await res.json()) as
        | { ok: true; sku: string }
        | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        return null;
      }

      return data.sku;
    } catch {
      setError("Could not generate SKU.");
      return null;
    }
  }

  function stageVariant(variantId: number, input: PendingVariantIdentifiers) {
    const sku = input.sku?.trim();
    const barcode = input.barcode?.trim();

    if (!sku && !barcode) {
      return;
    }

    setPendingByVariantId((current) => {
      const existing = current[variantId] ?? {};
      const next: PendingVariantIdentifiers = { ...existing };
      if (sku) {
        next.sku = sku;
      }
      if (barcode) {
        next.barcode = barcode;
      }
      return {
        ...current,
        [variantId]: next,
      };
    });
    setError(null);
  }

  function clearPendingVariant(variantId: number) {
    setPendingByVariantId((current) => {
      const next = { ...current };
      delete next[variantId];
      return next;
    });
  }

  async function flushPendingVariants(
    variantIds: number[],
  ): Promise<{ ok: true; assigned: Record<number, string> } | { ok: false }> {
    const assigned: Record<number, string> = {};
    const ids = [...new Set(variantIds)];

    setSavingPendingSkus(true);
    setError(null);

    try {
      for (const variantId of ids) {
        const pending = pendingByVariantId[variantId];
        if (!pending?.sku && !pending?.barcode) {
          continue;
        }

        const result = await assignVariantIdentifiers(variantId, {
          sku: pending.sku,
          barcode: pending.barcode ?? pending.sku,
          refresh: false,
        });
        if (!result) {
          return { ok: false };
        }

        assigned[variantId] = result.sku ?? pending.sku ?? pending.barcode ?? "";
      }

      if (Object.keys(assigned).length > 0) {
        setPendingByVariantId((current) => {
          const next = { ...current };
          for (const variantId of Object.keys(assigned).map(Number)) {
            delete next[variantId];
          }
          return next;
        });
      }

      return { ok: true, assigned };
    } finally {
      setSavingPendingSkus(false);
    }
  }

  async function saveAllPendingVariants() {
    const variantIds = Object.keys(pendingByVariantId).map(Number);
    if (variantIds.length === 0) {
      return;
    }

    const result = await flushPendingVariants(variantIds);
    if (!result.ok) {
      return;
    }

    setActionMessage(
      `Saved ${Object.keys(result.assigned).length} variant update(s) to Shopify.`,
    );
    setRefreshKey((value) => value + 1);
  }

  async function stageGeneratedSkusForVariants(variantIds: number[]) {
    setError(null);
    setActionMessage(null);

    const used = new Set(
      Object.values(pendingByVariantId)
        .map((pending) => pending.sku?.toUpperCase())
        .filter((sku): sku is string => Boolean(sku)),
    );
    const next = { ...pendingByVariantId };
    let staged = 0;

    for (const variantId of variantIds) {
      if (next[variantId]?.sku) {
        continue;
      }

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const sku = await suggestSku();
        if (!sku) {
          break;
        }

        const key = sku.toUpperCase();
        if (used.has(key)) {
          continue;
        }

        next[variantId] = { sku, barcode: sku };
        used.add(key);
        staged += 1;
        break;
      }
    }

    setPendingByVariantId(next);
    if (staged > 0) {
      setActionMessage(
        `Staged ${staged} SKU(s). Add more or click Save to Shopify when ready.`,
      );
    }
  }

  const variantCountByProduct = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of enrichedItems) {
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
    }
    return counts;
  }, [enrichedItems]);

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
      if (filter === "config-products") {
        if ((variantCountByProduct.get(item.productId) ?? 0) < 2) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      return (
        item.displayName.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.barcode?.toLowerCase().includes(query) ||
        item.productTitle.toLowerCase().includes(query)
      );
    });
  }, [enrichedItems, filter, search, variantCountByProduct]);

  const { configProductGroups, singleVariantItems } = useMemo(() => {
    const byProduct = new Map<number, EnrichedItem[]>();

    for (const item of filteredItems) {
      const list = byProduct.get(item.productId) ?? [];
      list.push(item);
      byProduct.set(item.productId, list);
    }

    const configProductGroups: ProductConfigGroupData[] = [];
    const singleVariantItems: EnrichedItem[] = [];

    for (const [productId, variants] of byProduct) {
      const sorted = [...variants].sort((a, b) =>
        a.variantTitle.localeCompare(b.variantTitle),
      );

      if (sorted.length > 1) {
        configProductGroups.push({
          productId,
          productTitle: sorted[0]!.productTitle,
          imageUrl: sorted[0]!.imageUrl,
          variants: sorted,
        });
      } else {
        singleVariantItems.push(sorted[0]!);
      }
    }

    configProductGroups.sort((a, b) =>
      a.productTitle.localeCompare(b.productTitle),
    );
    singleVariantItems.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { configProductGroups, singleVariantItems };
  }, [filteredItems]);

  const visibleConfigGroups = configProductGroups;
  const visibleSingleItems = filter === "config-products" ? [] : singleVariantItems;
  const visibleCount = visibleConfigGroups.length + visibleSingleItems.length;

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
              Live stock from Shopify for every tracked variant. Add SKUs and barcodes
              locally, then click <strong>Save to Shopify</strong> when you are done —
              the page will not reload until then. Barcode defaults to the SKU if left
              blank. Config products can set master pack size and child pieces together.
              Update quantities on{" "}
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
              placeholder="Search product, SKU, or barcode…"
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
          ) : visibleCount === 0 ? (
            <p className="py-12 text-center text-muted-foreground">
              No config products match your filters.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleConfigGroups.map((group) => (
                <ProductConfigGroup
                  key={group.productId}
                  group={group}
                  allMasters={masters}
                  catalogMasters={catalogMasters}
                  pendingByVariantId={pendingByVariantId}
                  generatingVariantId={generatingVariantId}
                  saving={loading || savingPendingSkus}
                  onStageVariant={stageVariant}
                  onClearPendingVariant={clearPendingVariant}
                  onSuggestSku={suggestSku}
                  onFlushPendingVariants={flushPendingVariants}
                  onStageGeneratedSkus={stageGeneratedSkusForVariants}
                  onSaved={(message) => {
                    setActionMessage(
                      message ??
                        `Saved master and child mappings for ${group.productTitle}.`,
                    );
                    setRefreshKey((value) => value + 1);
                  }}
                  onError={setError}
                />
              ))}

              {visibleSingleItems.map((item) => {
                const isMasterSku =
                  item.sku != null &&
                  masterBySku.has(item.sku.toUpperCase());

                return (
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
                          SKU: {item.sku}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No SKU</p>
                      )}
                      {item.barcode ? (
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          Barcode: {item.barcode}
                        </p>
                      ) : item.sku ? (
                        <p className="text-xs text-muted-foreground">No barcode</p>
                      ) : null}
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

                  {item.sku && !isMasterSku ? (
                    <SingleVariantMapping
                      childSku={item.sku}
                      allMasters={masters}
                      catalogMasters={catalogMasters}
                      initialMasterSku={
                        item.childPiecesPerUnit ? item.masterInfo?.sku : undefined
                      }
                      initialPiecesPerUnit={item.childPiecesPerUnit}
                      onSaved={(message) => {
                        setActionMessage(message ?? `Updated mapping for ${item.sku}.`);
                        setRefreshKey((value) => value + 1);
                      }}
                      onError={setError}
                    />
                  ) : null}

                  {item.sku && !item.barcode ? (
                    <VariantSkuAssign
                      variantId={item.variantId}
                      mode="barcode"
                      existingSku={item.sku}
                      pending={pendingByVariantId[item.variantId]}
                      disabled={savingPendingSkus}
                      onStage={stageVariant}
                      onClearPending={clearPendingVariant}
                    />
                  ) : null}

                  {!item.sku ? (
                    <VariantSkuAssign
                      variantId={item.variantId}
                      pending={pendingByVariantId[item.variantId]}
                      disabled={savingPendingSkus}
                      onStage={stageVariant}
                      onClearPending={clearPendingVariant}
                      onSuggestSku={suggestSku}
                    />
                  ) : null}

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
                  ) : null}
                </div>
                );
              })}
            </div>
          )}

          {!loading && visibleCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Showing {visibleConfigGroups.length} config product
              {visibleConfigGroups.length === 1 ? "" : "s"} (
              {visibleConfigGroups.reduce((sum, group) => sum + group.variants.length, 0)}{" "}
              variants) and {visibleSingleItems.length} single variant
              {visibleSingleItems.length === 1 ? "" : "s"} · {filteredItems.length} of{" "}
              {items.length} total
            </p>
          ) : null}
        </CardContent>
      </Card>

      {pendingCount > 0 ? (
        <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-card p-4 shadow-lg">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {pendingCount} variant update{pendingCount === 1 ? "" : "s"} ready to save
            </p>
            <p className="text-xs text-muted-foreground">
              SKUs and barcodes are staged locally until you save them to Shopify.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={savingPendingSkus}
              onClick={() => setPendingByVariantId({})}
            >
              Clear all
            </Button>
            <Button
              type="button"
              disabled={savingPendingSkus}
              onClick={() => void saveAllPendingVariants()}
            >
              {savingPendingSkus ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save to Shopify
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
