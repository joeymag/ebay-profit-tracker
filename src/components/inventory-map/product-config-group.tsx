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
  onSaved: (message?: string) => void;
  onError: (message: string | null) => void;
};

type VariantRole = "master" | "child" | "none";

type VariantConfigState = {
  roles: Record<number, VariantRole>;
  masterPackSizes: Record<number, string>;
  childMasterVariantId: Record<number, number>;
  childPieces: Record<number, string>;
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

function variantLabel(variant: ConfigGroupVariant): string {
  return variant.variantTitle === "Default Title" ? "Default" : variant.variantTitle;
}

function pickDefaultMasterVariant(variants: ConfigGroupVariant[]): ConfigGroupVariant {
  const ranked = [...variants].sort(
    (a, b) => (variantPackHint(b) ?? 0) - (variantPackHint(a) ?? 0),
  );

  const bulkCandidate = ranked.find((variant) => (variantPackHint(variant) ?? 0) >= 50);
  return bulkCandidate ?? ranked[0] ?? variants[0]!;
}

function defaultMasterPackSize(variant: ConfigGroupVariant): string {
  if (variant.masterInfo?.packSize) {
    return String(variant.masterInfo.packSize);
  }

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

function findMasterVariantIdForChild(
  variants: ConfigGroupVariant[],
  child: ConfigGroupVariant,
): number | null {
  if (!child.masterInfo) {
    return null;
  }

  const masterSku = child.masterInfo.sku.toUpperCase();
  const match = variants.find(
    (variant) => variant.sku?.toUpperCase() === masterSku,
  );
  return match?.variantId ?? null;
}

function buildInitialConfig(variants: ConfigGroupVariant[]): VariantConfigState {
  const roles: Record<number, VariantRole> = {};
  const masterPackSizes: Record<number, string> = {};
  const childMasterVariantId: Record<number, number> = {};
  const childPieces: Record<number, string> = {};

  const fallbackMasterId = pickDefaultMasterVariant(variants).variantId;

  for (const variant of variants) {
    const isExistingMaster =
      variant.masterInfo &&
      variant.sku?.toUpperCase() === variant.masterInfo.sku.toUpperCase();
    const isExistingChild = Boolean(variant.childPiecesPerUnit != null && variant.masterInfo);

    if (isExistingMaster) {
      roles[variant.variantId] = "master";
      masterPackSizes[variant.variantId] = defaultMasterPackSize(variant);
      continue;
    }

    if (isExistingChild) {
      roles[variant.variantId] = "child";
      childPieces[variant.variantId] = defaultChildPieces(variant);
      childMasterVariantId[variant.variantId] =
        findMasterVariantIdForChild(variants, variant) ?? fallbackMasterId;
      continue;
    }

    const hint = variantPackHint(variant);
    if ((hint ?? 0) >= 50) {
      roles[variant.variantId] = "master";
      masterPackSizes[variant.variantId] = defaultMasterPackSize(variant);
    } else {
      roles[variant.variantId] = "none";
    }
  }

  if (!Object.values(roles).includes("master")) {
    roles[fallbackMasterId] = "master";
    masterPackSizes[fallbackMasterId] = defaultMasterPackSize(
      variants.find((variant) => variant.variantId === fallbackMasterId) ??
        pickDefaultMasterVariant(variants),
    );
  }

  const firstMasterId = Number(
    Object.entries(roles).find(([, role]) => role === "master")?.[0] ??
      fallbackMasterId,
  );

  for (const variant of variants) {
    if (roles[variant.variantId] !== "none") {
      continue;
    }

    roles[variant.variantId] = "child";
    childPieces[variant.variantId] = defaultChildPieces(variant);
    childMasterVariantId[variant.variantId] = firstMasterId;
  }

  return { roles, masterPackSizes, childMasterVariantId, childPieces };
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
  const [config, setConfig] = useState<VariantConfigState>(() =>
    buildInitialConfig(group.variants),
  );
  const [localSaving, setLocalSaving] = useState(false);

  const masterVariants = useMemo(
    () =>
      group.variants.filter(
        (variant) => config.roles[variant.variantId] === "master",
      ),
    [config.roles, group.variants],
  );

  const masterCount = masterVariants.length;
  const childCount = group.variants.filter(
    (variant) => config.roles[variant.variantId] === "child",
  ).length;
  const missingSkuCount = group.variants.filter((variant) => !variant.sku).length;

  function setVariantRole(variantId: number, role: VariantRole) {
    setConfig((current) => {
      if (
        role !== "master" &&
        current.roles[variantId] === "master" &&
        group.variants.filter(
          (item) => item.variantId !== variantId && current.roles[item.variantId] === "master",
        ).length === 0
      ) {
        onError("Keep at least one master in this product group.");
        return current;
      }

      onError(null);
      const nextRoles = { ...current.roles, [variantId]: role };
      const nextMasterPackSizes = { ...current.masterPackSizes };
      const nextChildMasterVariantId = { ...current.childMasterVariantId };
      const nextChildPieces = { ...current.childPieces };

      const variant = group.variants.find((item) => item.variantId === variantId);
      if (!variant) {
        return current;
      }

      if (role === "master") {
        nextMasterPackSizes[variantId] =
          nextMasterPackSizes[variantId] ?? defaultMasterPackSize(variant);
      }

      if (role === "child") {
        const firstMaster = group.variants.find(
          (item) => item.variantId !== variantId && nextRoles[item.variantId] === "master",
        );
        nextChildPieces[variantId] =
          nextChildPieces[variantId] ?? defaultChildPieces(variant);
        if (firstMaster) {
          nextChildMasterVariantId[variantId] = firstMaster.variantId;
        }
      }

      return {
        roles: nextRoles,
        masterPackSizes: nextMasterPackSizes,
        childMasterVariantId: nextChildMasterVariantId,
        childPieces: nextChildPieces,
      };
    });
  }

  async function handleGenerateAll() {
    const missing = group.variants
      .filter((variant) => !variant.sku)
      .map((variant) => variant.variantId);
    if (!missing.length) {
      return;
    }
    await onGenerateAllSkus(missing);
  }

  async function resolveVariantSku(variant: ConfigGroupVariant): Promise<string | null> {
    if (variant.sku) {
      return variant.sku;
    }
    return onGenerateSku(variant.variantId, { refresh: false });
  }

  async function handleSaveGroup() {
    const masters = group.variants.filter(
      (variant) => config.roles[variant.variantId] === "master",
    );
    const children = group.variants.filter(
      (variant) => config.roles[variant.variantId] === "child",
    );

    if (masters.length === 0) {
      onError("Mark at least one variant as Master.");
      return;
    }

    setLocalSaving(true);
    onError(null);

    try {
      const masterSkuByVariantId = new Map<number, string>();
      const savedChildSkus: string[] = [];

      for (const master of masters) {
        const pack = Number.parseInt(config.masterPackSizes[master.variantId] ?? "", 10);
        if (!Number.isFinite(pack) || pack <= 0) {
          onError(`Enter a valid pack size for ${variantLabel(master)}.`);
          return;
        }

        const masterSku = await resolveVariantSku(master);
        if (!masterSku) {
          return;
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
          onError(masterData.error ?? `Could not save master SKU ${masterSku}.`);
          return;
        }

        masterSkuByVariantId.set(master.variantId, masterSku);
      }

      for (const child of children) {
        const linkedMasterVariantId = config.childMasterVariantId[child.variantId];
        const linkedMaster = group.variants.find(
          (variant) => variant.variantId === linkedMasterVariantId,
        );
        const masterSku = linkedMasterVariantId
          ? (masterSkuByVariantId.get(linkedMasterVariantId) ?? linkedMaster?.sku ?? undefined)
          : undefined;

        if (!masterSku) {
          onError(`Choose which master ${variantLabel(child)} links to.`);
          return;
        }

        const pieces = Number.parseFloat(config.childPieces[child.variantId] ?? "");
        if (!Number.isFinite(pieces) || pieces <= 0) {
          onError(`Enter pieces per unit for ${variantLabel(child)}.`);
          return;
        }

        const childSku = await resolveVariantSku(child);
        if (!childSku) {
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

        savedChildSkus.push(childSku);
      }

      const masterSkus = masters
        .map((master) => masterSkuByVariantId.get(master.variantId) ?? master.sku)
        .filter((sku): sku is string => Boolean(sku));

      if (savedChildSkus.length > 0) {
        const syncRes = await fetch("/api/inventory/sync-listing-stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterSkus,
            childSkus: savedChildSkus,
          }),
        });
        const syncData = (await syncRes.json()) as
          | { ok: true; results: { childSku: string; sellable: number }[] }
          | { ok: false; error: string };

        if (!syncData.ok) {
          onError(
            syncData.error ??
              "Saved mappings but could not update Shopify listing stock.",
          );
          return;
        }

        onSaved(
          `Saved ${masterSkus.length} master(s) and updated Shopify stock for ${syncData.results.length} child listing(s).`,
        );
        return;
      }

      onSaved(`Saved ${masterSkus.length} master SKU(s).`);
    } catch {
      onError("Could not save product group.");
    } finally {
      setLocalSaving(false);
    }
  }

  async function handleUpdateShopifyStock() {
    const masters = group.variants.filter(
      (variant) => config.roles[variant.variantId] === "master" && variant.sku,
    );
    const children = group.variants.filter(
      (variant) => config.roles[variant.variantId] === "child" && variant.sku,
    );

    if (children.length === 0) {
      onError("Save child mappings with SKUs first, then update Shopify stock.");
      return;
    }

    setLocalSaving(true);
    onError(null);

    try {
      const syncRes = await fetch("/api/inventory/sync-listing-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterSkus: masters.map((variant) => variant.sku!),
          childSkus: children.map((variant) => variant.sku!),
        }),
      });
      const syncData = (await syncRes.json()) as
        | { ok: true; results: { childSku: string; sellable: number }[] }
        | { ok: false; error: string };

      if (!syncData.ok) {
        onError(syncData.error ?? "Could not update Shopify listing stock.");
        return;
      }

      onSaved(
        `Updated Shopify stock for ${syncData.results.length} child listing(s) from master pool.`,
      );
    } catch {
      onError("Could not update Shopify listing stock.");
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
              {group.variants.length} variants · mark one or more masters, link children
              to the right bulk SKU
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline">{group.variants.length} variants</Badge>
              <Badge variant="outline" className="border-primary/40 text-primary">
                {masterCount} master{masterCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline">{childCount} child</Badge>
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleUpdateShopifyStock()}
          >
            Update Shopify stock
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleSaveGroup()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save masters &amp; children
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
            Some config listings need <strong>more than one master</strong> (e.g. different
            bulk box sizes). Set role to <strong>Master</strong> for each bulk SKU with its
            pack size. Set <strong>Child</strong> for sold sizes and pick which master they
            deduct from. After save, <strong>child listing stock on Shopify</strong> is updated
            from the master piece pool (sellable units).
          </p>

          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Master / pieces</th>
                  <th className="px-3 py-2 font-medium">Sales</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {group.variants.map((variant) => {
                  const role = config.roles[variant.variantId] ?? "none";
                  const packHint = variantPackHint(variant);
                  const isMaster = role === "master";
                  const isChild = role === "child";

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
                          <p className="font-medium">{variantLabel(variant)}</p>
                          {isMaster ? (
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              Master
                            </Badge>
                          ) : null}
                          {isChild ? <Badge variant="outline">Child</Badge> : null}
                        </div>
                        {packHint ? (
                          <p className="text-xs text-muted-foreground">
                            Pack hint: {packHint} pc
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
                        <select
                          className="h-8 min-w-[108px] rounded-md border border-input bg-background px-2 text-xs"
                          value={role}
                          disabled={busy}
                          onChange={(event) =>
                            setVariantRole(
                              variant.variantId,
                              event.target.value as VariantRole,
                            )
                          }
                        >
                          <option value="master">Master</option>
                          <option value="child">Child</option>
                          <option value="none">Skip</option>
                        </select>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {isMaster ? (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Pack size (pc/box)</p>
                            <Input
                              inputMode="numeric"
                              value={config.masterPackSizes[variant.variantId] ?? ""}
                              disabled={busy}
                              onChange={(event) =>
                                setConfig((current) => ({
                                  ...current,
                                  masterPackSizes: {
                                    ...current.masterPackSizes,
                                    [variant.variantId]: event.target.value,
                                  },
                                }))
                              }
                              placeholder="e.g. 1000"
                              className="h-8 w-28"
                            />
                          </div>
                        ) : null}
                        {isChild ? (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Linked master</p>
                              <select
                                className="h-8 w-full min-w-[140px] rounded-md border border-input bg-background px-2 text-xs"
                                value={config.childMasterVariantId[variant.variantId] ?? ""}
                                disabled={busy || masterVariants.length === 0}
                                onChange={(event) =>
                                  setConfig((current) => ({
                                    ...current,
                                    childMasterVariantId: {
                                      ...current.childMasterVariantId,
                                      [variant.variantId]: Number(event.target.value),
                                    },
                                  }))
                                }
                              >
                                {masterVariants.map((master) => (
                                  <option key={master.variantId} value={master.variantId}>
                                    {variantLabel(master)}
                                    {master.sku ? ` (${master.sku})` : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Pc per unit sold</p>
                              <Input
                                inputMode="decimal"
                                value={config.childPieces[variant.variantId] ?? ""}
                                disabled={busy}
                                onChange={(event) =>
                                  setConfig((current) => ({
                                    ...current,
                                    childPieces: {
                                      ...current.childPieces,
                                      [variant.variantId]: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Pc per unit"
                                className="h-8 w-28"
                              />
                            </div>
                          </div>
                        ) : null}
                        {role === "none" ? (
                          <span className="text-xs text-muted-foreground">Not mapped</span>
                        ) : null}
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
