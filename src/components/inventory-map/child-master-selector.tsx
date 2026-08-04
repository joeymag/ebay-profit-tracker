"use client";

import { Input } from "@/components/ui/input";
import type { InventoryMasterWithChildren } from "@/lib/inventory/master-child-types";

export type ChildMasterOption = {
  sku: string;
  label: string;
  packSize: number;
  source: "product" | "global";
  variantId?: number;
  needsSku?: boolean;
};

type ChildMasterSelectorProps = {
  masterSku: string;
  piecesPerUnit: string;
  options: ChildMasterOption[];
  disabled?: boolean;
  onMasterSkuChange: (sku: string) => void;
  onPiecesChange: (value: string) => void;
};

export function buildChildMasterOptions(input: {
  inProductMasters: {
    sku: string;
    label: string;
    packSize: number;
    variantId?: number;
    needsSku?: boolean;
  }[];
  allMasters: InventoryMasterWithChildren[];
  catalogMasters?: { sku: string; label: string; packSize: number }[];
}): ChildMasterOption[] {
  const inProductSkus = new Set(
    input.inProductMasters
      .map((master) => master.sku.trim().toUpperCase())
      .filter(Boolean),
  );
  const options: ChildMasterOption[] = [];
  const globalSkus = new Set<string>();

  for (const master of input.inProductMasters) {
    options.push({
      sku: master.sku,
      label: master.label,
      packSize: master.packSize,
      source: "product",
      variantId: master.variantId,
      needsSku: master.needsSku,
    });
    if (master.sku) {
      globalSkus.add(master.sku.toUpperCase());
    }
  }

  const globalSources = [
    ...(input.catalogMasters ?? []),
    ...input.allMasters.map((master) => ({
      sku: master.sku,
      label: master.label?.trim() || master.sku,
      packSize: master.packSize,
    })),
  ];

  for (const master of globalSources) {
    const sku = master.sku.trim();
    if (!sku) {
      continue;
    }
    const key = sku.toUpperCase();
    if (inProductSkus.has(key) || globalSkus.has(key)) {
      continue;
    }
    globalSkus.add(key);
    options.push({
      sku,
      label: master.label,
      packSize: master.packSize,
      source: "global",
    });
  }

  return options.sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "product" ? -1 : 1;
    }
    return a.label.localeCompare(b.label);
  });
}

export function ChildMasterSelector({
  masterSku,
  piecesPerUnit,
  options,
  disabled,
  onMasterSkuChange,
  onPiecesChange,
}: ChildMasterSelectorProps) {
  const productOptions = options.filter((option) => option.source === "product");
  const globalOptions = options.filter((option) => option.source === "global");

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Linked master</p>
        <select
          className="h-8 w-full min-w-[140px] rounded-md border border-input bg-background px-2 text-xs"
          value={masterSku}
          disabled={disabled || options.length === 0}
          onChange={(event) => onMasterSkuChange(event.target.value)}
        >
          {options.length === 0 ? (
            <option value="">No master SKUs yet</option>
          ) : null}
          {productOptions.length > 0 ? (
            <optgroup label="Masters in this product">
              {productOptions.map((option) => (
                <option
                  key={option.variantId ?? (option.sku || option.label)}
                  value={option.sku}
                  disabled={option.needsSku || !option.sku}
                >
                  {option.label}
                  {option.sku ? ` (${option.sku})` : " — add SKU first"} ·{" "}
                  {option.packSize.toLocaleString()} pc/box
                </option>
              ))}
            </optgroup>
          ) : null}
          {globalOptions.length > 0 ? (
            <optgroup label="Other master SKUs">
              {globalOptions.map((option) => (
                <option key={option.sku} value={option.sku}>
                  {option.sku} · {option.packSize.toLocaleString()} pc/box
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Pc per unit sold</p>
        <Input
          inputMode="decimal"
          value={piecesPerUnit}
          disabled={disabled}
          onChange={(event) => onPiecesChange(event.target.value)}
          placeholder="Pc per unit"
          className="h-8 w-28"
        />
      </div>
    </div>
  );
}
