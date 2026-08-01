"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  ScanBarcode,
  Sparkles,
} from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
import { ReorderBadge } from "@/components/stock/reorder-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryMasterWithChildren } from "@/lib/inventory/master-child-types";
import { cn } from "@/lib/utils";

export type ConfigGroupVariant = {
  variantId: number;
  productId: number;
  sku: string | null;
  productTitle: string;
  variantTitle: string;
  displayName: string;
  imageUrl: string | null;
  available: number;
  displayStock: number;
  stockLabel: string;
  packSize: number | null;
  unitsSold30Days: number;
  unitsSold90Days: number;
  reorderLabel: string;
  reorderTone: "urgent" | "consider" | "quiet" | "none";
  masterInfo?: InventoryMasterWithChildren;
  childPiecesPerUnit?: number;
};

export type ProductConfigGroupData = {
  productId: number;
  productTitle: string;
  imageUrl: string | null;
  variants: ConfigGroupVariant[];
};

type ProductConfigGroupProps = {
  group: ProductConfigGroupData;
  generatingVariantId: number | null;
  saving: boolean;
  onGenerateSku: (
    variantId: number,
    options?: { refresh?: boolean },
  ) => Promise<string | null>;
  onGenerateAllSkus: (variantIds: number[]) => Promise<void>;
  onSaved: () => void;
  onError: (message: string | null) => void;
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

function parsePackFromVariantTitle(title: string): number | null {
  const match = title.match(/\/\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function variantPackHint(variant: ConfigGroupVariant): number | null {
  return variant.packSize ?? parsePackFromVariantTitle(variant.variantTitle);
}

function pickDefaultMasterVariant(variants: ConfigGroupVariant[]): ConfigGroupVariant {
  const ranked = [...variants].sort(
    (a, b) => (variantPackHint(b) ?? 0) - (variantPackHint(a) ?? 0),
  );

  const bulkCandidate = ranked.find((variant) => (variantPackHint(variant) ?? 0) >= 50);
  if (bulkCandidate) {
    return bulkCandidate;
  }

  return ranked[0] ?? variants[0]!;
}

function defaultMasterPackSize(variant: ConfigGroupVariant): string {
  const hint = variantPackHint(variant);
  if (hint && hint >= 50) {
    return String(Math.floor(hint));
  }
  return "1000";
}

function defaultChildPieces(variant: ConfigGroupVariant): string {
  if (variant.childPiecesPerUnit) {
    return String(variant.childPiecesPerUnit);
  }

  const hint = variantPackHint(variant);
  if (hint && hint > 0) {
    return String(hint);
  }

  return "1";
}

export function ProductConfigGroup({
  group,
  generatingVariantId,
  saving,
  onGenerateSku,
  onGenerateAllSkus,
  onSaved,
  onError,
}: ProductConfigGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [masterVariantId, setMasterVariantId] = useState<number>(() =>
    pickDefaultMasterVariant(group.variants).variantId,
  );
  const [masterPackSize, setMasterPackSize] = useState(() => {
    const master = pickDefaultMasterVariant(group.variants);
    return defaultMasterPackSize(master);
  });
  const [childPieces, setChildPieces] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const variant of group.variants) {
      initial[variant.variantId] = defaultChildPieces(variant);
    }
    return initial;
  });
  const [localSaving, setLocalSaving] = useState(false);

  const resolvedMasterVariantId = useMemo(() => {
    if (group.variants.some((variant) => variant.variantId === masterVariantId)) {
      return masterVariantId;
    }
    return pickDefaultMasterVariant(group.variants).variantId;
  }, [group.variants, masterVariantId]);

  const masterVariant = useMemo(
    () =>
      group.variants.find((variant) => variant.variantId === resolvedMasterVariantId) ??
      pickDefaultMasterVariant(group.variants),
    [group.variants, resolvedMasterVariantId],
  );

  function selectMasterVariant(variant: ConfigGroupVariant) {
    setMasterVariantId(variant.variantId);
    setMasterPackSize(defaultMasterPackSize(variant));
  }

  const childVariants = useMemo(
    () =>
      group.variants.filter((variant) => variant.variantId !== resolvedMasterVariantId),
    [group.variants, resolvedMasterVariantId],
  );

  const missingSkuCount = group.variants.filter((variant) => !variant.sku).length;

  async function handleGenerateAll() {
    const missing = group.variants
      .filter((variant) => !variant.sku)
      .map((variant) => variant.variantId);
    if (!missing.length) {
      return;
    }
    await onGenerateAllSkus(missing);
  }

  async function handleSaveGroup() {
    if (!masterVariant) {
      onError("Select a master variant.");
      return;
    }

    const pack = Number.parseInt(masterPackSize, 10);
    if (!Number.isFinite(pack) || pack <= 0) {
      onError("Enter a valid master pack size.");
      return;
    }

    setLocalSaving(true);
    onError(null);

    try {
      let masterSku = masterVariant.sku;
      if (!masterSku) {
        masterSku = await onGenerateSku(masterVariant.variantId, { refresh: false });
        if (!masterSku) {
          return;
        }
      }

      const masterRes = await fetch("/api/inventory/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: masterSku,
          packSize: pack,
          syncFromShopify: true,
        }),
      });
      const masterData = await masterRes.json();
      if (!masterData.ok) {
        onError(masterData.error ?? "Could not save master SKU.");
        return;
      }

      for (const child of childVariants) {
        let childSku = child.sku;
        if (!childSku) {
          childSku = await onGenerateSku(child.variantId, { refresh: false });
          if (!childSku) {
            return;
          }
        }

        const pieces = Number.parseFloat(childPieces[child.variantId] ?? "");
        if (!Number.isFinite(pieces) || pieces <= 0) {
          onError(`Enter pieces per unit for ${child.variantTitle}.`);
          return;
        }

        const childRes = await fetch("/api/inventory/child-mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            childSku,
            masterSku,
            piecesPerUnit: pieces,
          }),
        });
        const childData = await childRes.json();
        if (!childData.ok) {
          onError(childData.error ?? `Could not map child SKU ${childSku}.`);
          return;
        }
      }

      onSaved();
    } catch {
      onError("Could not save product group.");
    } finally {
      setLocalSaving(false);
    }
  }

  const busy = saving || localSaving || generatingVariantId != null;

  return (
    <div className="col-span-full rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          )}
          <LineItemImage
            src={group.imageUrl}
            alt={group.productTitle}
            className="size-14 shrink-0 rounded-lg"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold leading-snug">{group.productTitle}</p>
            <p className="text-sm text-muted-foreground">
              {group.variants.length} variants · configure master pack and child pieces
              together
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline">{group.variants.length} variants</Badge>
              {missingSkuCount > 0 ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                  {missingSkuCount} missing SKU
                </Badge>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex flex-wrap gap-2">
          {missingSkuCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleGenerateAll()}
            >
              {generatingVariantId != null ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate all SKUs
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleSaveGroup()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save master &amp; children
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
            <div className="min-w-[220px] flex-1 space-y-1">
              <label
                htmlFor={`master-select-${group.productId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Master variant (bulk box)
              </label>
              <select
                id={`master-select-${group.productId}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={resolvedMasterVariantId}
                disabled={busy}
                onChange={(event) => {
                  const variant = group.variants.find(
                    (item) => item.variantId === Number(event.target.value),
                  );
                  if (variant) {
                    selectMasterVariant(variant);
                  }
                }}
              >
                {group.variants.map((variant) => (
                  <option key={variant.variantId} value={variant.variantId}>
                    {variant.variantTitle === "Default Title"
                      ? "Default"
                      : variant.variantTitle}
                    {variantPackHint(variant)
                      ? ` · ${variantPackHint(variant)} pc pack`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label
                htmlFor={`master-pack-${group.productId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Master pack size (pieces per box)
              </label>
              <Input
                id={`master-pack-${group.productId}`}
                inputMode="numeric"
                value={masterPackSize}
                disabled={busy}
                onChange={(e) => setMasterPackSize(e.target.value)}
                placeholder="e.g. 1000"
                className="h-10 w-36"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pick the bulk listing (e.g. m10 / 100). All other sizes become
              child SKUs that deduct pieces from this master pool.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Pieces per unit sold</th>
                  <th className="px-3 py-2 font-medium">Sales</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {group.variants.map((variant) => {
                  const isMaster = variant.variantId === resolvedMasterVariantId;
                  const packHint = variantPackHint(variant);
                  return (
                    <tr
                      key={variant.variantId}
                      className={cn(
                        "border-t border-border/50",
                        isMaster && "bg-primary/5",
                      )}
                    >
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">
                            {variant.variantTitle === "Default Title"
                              ? "Default"
                              : variant.variantTitle}
                          </p>
                          {isMaster ? (
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              Master
                            </Badge>
                          ) : (
                            <Badge variant="outline">Child</Badge>
                          )}
                        </div>
                        {packHint ? (
                          <p className="text-xs text-muted-foreground">
                            Pack hint: {packHint} pc per unit sold
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {variant.sku ? (
                          <p className="font-mono text-xs">{variant.sku}</p>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void onGenerateSku(variant.variantId)}
                          >
                            {generatingVariantId === variant.variantId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Sparkles className="size-4" />
                            )}
                            Generate
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Badge
                          variant="outline"
                          className={cn("font-mono tabular-nums", stockTone(variant.displayStock))}
                        >
                          {variant.stockLabel}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {isMaster ? (
                          <span className="text-xs font-medium text-primary">
                            Bulk box
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => selectMasterVariant(variant)}
                          >
                            Set as master
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {isMaster ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Input
                            inputMode="decimal"
                            value={childPieces[variant.variantId] ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              setChildPieces((current) => ({
                                ...current,
                                [variant.variantId]: e.target.value,
                              }))
                            }
                            placeholder="Pc per unit"
                            className="h-8 w-28"
                          />
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>30d: {variant.unitsSold30Days}</p>
                          <p>90d: {variant.unitsSold90Days}</p>
                          <ReorderBadge sales={variant} />
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {variant.sku ? (
                          <Button
                            render={<Link href="/stock" />}
                            variant="ghost"
                            size="sm"
                          >
                            <ScanBarcode className="size-4" />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
