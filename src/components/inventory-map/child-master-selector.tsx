"use client";

import { Input } from "@/components/ui/input";
import type { InventoryMasterWithChildren } from "@/lib/inventory/master-child-types";

export type ChildMasterOption = {
  sku: string;
  label: string;
  packSize: number;
  source: "product" | "global";
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
  inProductMasters: { sku: string; label: string; packSize: number }[];
  allMasters: InventoryMasterWithChildren[];
}): ChildMasterOption[] {
  const inProductSkus = new Set(
    input.inProductMasters.map((master) => master.sku.toUpperCase()),
  );
  const options: ChildMasterOption[] = [];

  for (const master of input.inProductMasters) {
    options.push({
      sku: master.sku,
      label: master.label,
      packSize: master.packSize,
      source: "product",
    });
  }

  for (const master of input.allMasters) {
    if (inProductSkus.has(master.sku.toUpperCase())) {
      continue;
    }
    options.push({
      sku: master.sku,
      label: master.label?.trim() || master.sku,
      packSize: master.packSize,
      source: "global",
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
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
                <option key={option.sku} value={option.sku}>
                  {option.label} ({option.sku}) · {option.packSize.toLocaleString()} pc/box
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
