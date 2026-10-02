"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, ScanBarcode } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
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
import type { StockSkuLookup } from "@/lib/shopify/inventory";

type LookupResponse =
  | { ok: true; item: StockSkuLookup }
  | { ok: false; error: string };

type SlotState = {
  skuInput: string;
  item: StockSkuLookup | null;
  productName: string;
  barcodeValue: string;
  loading: boolean;
  error: string | null;
};

function defaultLabelName(item: StockSkuLookup) {
  if (item.variantTitle && item.variantTitle !== "Default Title") {
    return `${item.productTitle} ${item.variantTitle}`;
  }
  return item.productTitle;
}

function emptySlot(initialSku = ""): SlotState {
  return {
    skuInput: initialSku,
    item: null,
    productName: "",
    barcodeValue: "",
    loading: false,
    error: null,
  };
}

function ProductSlot({
  label,
  slot,
  onSkuChange,
  onNameChange,
  onBarcodeChange,
  onLookup,
}: {
  label: string;
  slot: SlotState;
  onSkuChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onBarcodeChange: (value: string) => void;
  onLookup: () => void;
}) {
  const idPrefix = label.toLowerCase().replace(/\s+/g, "-");
  const usingSkuFallback =
    Boolean(slot.item) &&
    !slot.item?.barcode &&
    slot.barcodeValue.trim() === (slot.item?.sku ?? "").trim();

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-semibold">{label}</p>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          onLookup();
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={`${idPrefix}-sku`} className="text-sm font-medium">
            SKU
          </label>
          <Input
            id={`${idPrefix}-sku`}
            value={slot.skuInput}
            onChange={(event) => onSkuChange(event.target.value)}
            placeholder="Scan or type SKU"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={slot.loading || !slot.skuInput.trim()}>
          {slot.loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Looking up…
            </>
          ) : (
            <>
              <ScanBarcode className="size-4" />
              Find
            </>
          )}
        </Button>
      </form>

      {slot.error ? (
        <p className="text-sm text-destructive">{slot.error}</p>
      ) : null}

      {slot.item ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <LineItemImage
              src={slot.item.imageUrl}
              alt={slot.item.productTitle}
            />
            <div className="min-w-0 space-y-1">
              <p className="font-medium leading-snug">{slot.item.displayName}</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="font-mono text-xs">
                  SKU {slot.item.sku}
                </Badge>
                {slot.item.barcode ? (
                  <Badge variant="outline" className="font-mono text-xs">
                    Barcode {slot.item.barcode}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    No Shopify barcode — using SKU
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-name`}
              className="text-sm font-medium"
            >
              Name on label
            </label>
            <Input
              id={`${idPrefix}-name`}
              value={slot.productName}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="M8 A2 Nyloc Nuts Stainless Steel"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-barcode`}
              className="text-sm font-medium"
            >
              Barcode value
            </label>
            <Input
              id={`${idPrefix}-barcode`}
              value={slot.barcodeValue}
              onChange={(event) => onBarcodeChange(event.target.value)}
              placeholder="Barcode or SKU to encode"
              className="font-mono"
              autoComplete="off"
            />
            {usingSkuFallback ? (
              <p className="text-xs text-muted-foreground">
                This variant has no barcode in Shopify, so the SKU is encoded
                instead.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function StockLabelPanel({ initialSku = "" }: { initialSku?: string }) {
  const [top, setTop] = useState<SlotState>(() => emptySlot(initialSku));
  const [bottom, setBottom] = useState<SlotState>(() => emptySlot());
  const [copies, setCopies] = useState("1");

  const labelUrl = useMemo(() => {
    const sku = (top.item?.sku ?? top.skuInput).trim();
    if (!sku || !top.barcodeValue.trim() || !top.productName.trim()) {
      return null;
    }

    const params = new URLSearchParams({
      sku,
      barcode: top.barcodeValue.trim(),
      title: top.productName.trim(),
    });

    const sku2 = (bottom.item?.sku ?? bottom.skuInput).trim();
    if (
      sku2 &&
      bottom.productName.trim() &&
      bottom.barcodeValue.trim()
    ) {
      params.set("sku2", sku2);
      params.set("title2", bottom.productName.trim());
      params.set("barcode2", bottom.barcodeValue.trim());
    }

    const copyCount = Number.parseInt(copies, 10);
    if (Number.isFinite(copyCount) && copyCount > 1) {
      params.set("copies", String(Math.min(50, copyCount)));
    }
    return `/api/products/stock-label?${params.toString()}`;
  }, [bottom, copies, top]);

  const bottomReady =
    Boolean(bottom.item) &&
    Boolean(bottom.productName.trim()) &&
    Boolean(bottom.barcodeValue.trim());

  const canPrint =
    Boolean(labelUrl) &&
    Boolean(top.item) &&
    Boolean(top.productName.trim()) &&
    Boolean(top.barcodeValue.trim());

  async function lookupSlot(
    which: "top" | "bottom",
    rawSku?: string,
  ) {
    const current = which === "top" ? top : bottom;
    const setSlot = which === "top" ? setTop : setBottom;
    const sku = (rawSku ?? current.skuInput).trim();
    if (!sku) {
      return;
    }

    setSlot((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(
        `/api/shopify/inventory/lookup?sku=${encodeURIComponent(sku)}`,
      );
      const payload = (await response.json()) as LookupResponse;
      if (!payload.ok) {
        setSlot((prev) => ({
          ...prev,
          item: null,
          loading: false,
          error: payload.error,
        }));
        return;
      }

      setSlot({
        skuInput: payload.item.sku,
        item: payload.item,
        productName: defaultLabelName(payload.item),
        barcodeValue: payload.item.barcode?.trim() || payload.item.sku,
        loading: false,
        error: null,
      });
    } catch {
      setSlot((prev) => ({
        ...prev,
        item: null,
        loading: false,
        error: "Could not look up that SKU.",
      }));
    }
  }

  useEffect(() => {
    if (initialSku.trim()) {
      void lookupSlot("top", initialSku);
    }
    // Load once from the URL sku query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewTopName = top.productName.trim() || "Top product";
  const previewTopBarcode = top.barcodeValue.trim() || "BARCODE";
  const previewBottomName = bottomReady
    ? bottom.productName.trim()
    : top.productName.trim() || "Bottom product";
  const previewBottomBarcode = bottomReady
    ? bottom.barcodeValue.trim()
    : top.barcodeValue.trim() || "BARCODE";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Print 4×6 stock labels (2 per sheet)</CardTitle>
          <CardDescription>
            Put one product on the top sticker and another on the bottom — or
            leave the bottom blank to print the same product twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ProductSlot
            label="Top sticker"
            slot={top}
            onSkuChange={(value) =>
              setTop((prev) => ({ ...prev, skuInput: value }))
            }
            onNameChange={(value) =>
              setTop((prev) => ({ ...prev, productName: value }))
            }
            onBarcodeChange={(value) =>
              setTop((prev) => ({ ...prev, barcodeValue: value }))
            }
            onLookup={() => void lookupSlot("top")}
          />

          <ProductSlot
            label="Bottom sticker (optional — different product)"
            slot={bottom}
            onSkuChange={(value) =>
              setBottom((prev) => ({ ...prev, skuInput: value }))
            }
            onNameChange={(value) =>
              setBottom((prev) => ({ ...prev, productName: value }))
            }
            onBarcodeChange={(value) =>
              setBottom((prev) => ({ ...prev, barcodeValue: value }))
            }
            onLookup={() => void lookupSlot("bottom")}
          />

          <div className="grid max-w-[7rem] gap-1.5">
            <label htmlFor="stock-label-copies" className="text-sm font-medium">
              Sheets
            </label>
            <Input
              id="stock-label-copies"
              inputMode="numeric"
              value={copies}
              onChange={(event) => setCopies(event.target.value)}
            />
          </div>

          <Button
            type="button"
            disabled={!canPrint}
            onClick={() => {
              if (labelUrl) {
                window.open(labelUrl, "_blank", "noopener,noreferrer");
              }
            }}
          >
            <Printer className="size-4" />
            Print stock labels
          </Button>
        </CardContent>
      </Card>

      <Card className="surface-card h-fit">
        <CardHeader>
          <CardTitle>Label layout</CardTitle>
          <CardDescription>
            4&quot; × 6&quot; sheet · two 4&quot; × 3&quot; stickers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto w-[11rem] overflow-hidden rounded-sm border border-foreground/30 bg-white text-center text-zinc-900 shadow-sm">
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-[10px] leading-tight font-semibold">
                {previewTopName}
              </p>
              <div className="mx-auto h-6 w-full max-w-[8rem] bg-[repeating-linear-gradient(90deg,#000_0_1px,#fff_1px_3px)]" />
              <p className="font-mono text-[7px] text-zinc-600">
                {previewTopBarcode}
              </p>
            </div>
            <div className="border-y border-dashed border-zinc-400 py-0.5">
              <p className="text-[7px] font-bold tracking-wide text-zinc-500">
                CUT HERE
              </p>
            </div>
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-[10px] leading-tight font-semibold">
                {previewBottomName}
              </p>
              <div className="mx-auto h-6 w-full max-w-[8rem] bg-[repeating-linear-gradient(90deg,#000_0_1px,#fff_1px_3px)]" />
              <p className="font-mono text-[7px] text-zinc-600">
                {previewBottomBarcode}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Top and bottom can be different products. Leave bottom empty to
            print the top product twice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
