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

function defaultLabelName(item: StockSkuLookup) {
  if (item.variantTitle && item.variantTitle !== "Default Title") {
    return `${item.productTitle} ${item.variantTitle}`;
  }
  return item.productTitle;
}

export function StockLabelPanel({ initialSku = "" }: { initialSku?: string }) {
  const [skuInput, setSkuInput] = useState(initialSku);
  const [item, setItem] = useState<StockSkuLookup | null>(null);
  const [productName, setProductName] = useState("");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [copies, setCopies] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usingSkuFallback =
    Boolean(item) &&
    !item?.barcode &&
    barcodeValue.trim() === (item?.sku ?? "").trim();

  const labelUrl = useMemo(() => {
    const sku = (item?.sku ?? skuInput).trim();
    if (!sku || !barcodeValue.trim()) {
      return null;
    }
    const params = new URLSearchParams({ sku, barcode: barcodeValue.trim() });
    const title = productName.trim();
    if (title) {
      params.set("title", title);
    }
    const copyCount = Number.parseInt(copies, 10);
    if (Number.isFinite(copyCount) && copyCount > 1) {
      params.set("copies", String(Math.min(50, copyCount)));
    }
    return `/api/products/stock-label?${params.toString()}`;
  }, [barcodeValue, copies, item?.sku, productName, skuInput]);

  async function lookupSku(rawSku?: string) {
    const sku = (rawSku ?? skuInput).trim();
    if (!sku) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/shopify/inventory/lookup?sku=${encodeURIComponent(sku)}`,
      );
      const payload = (await response.json()) as LookupResponse;
      if (!payload.ok) {
        setItem(null);
        setError(payload.error);
        return;
      }

      setItem(payload.item);
      setSkuInput(payload.item.sku);
      setProductName(defaultLabelName(payload.item));
      setBarcodeValue(payload.item.barcode?.trim() || payload.item.sku);
    } catch {
      setItem(null);
      setError("Could not look up that SKU.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialSku.trim()) {
      void lookupSku(initialSku);
    }
    // Load once from the URL sku query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Print 4×6 stock labels (2 per sheet)</CardTitle>
          <CardDescription>
            Each 4×6 label prints two stock stickers (name + barcode) with a cut
            line in the middle — for shelves, bins, and stock locations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void lookupSku();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <label htmlFor="stock-label-sku" className="text-sm font-medium">
                SKU
              </label>
              <Input
                id="stock-label-sku"
                value={skuInput}
                onChange={(event) => setSkuInput(event.target.value)}
                placeholder="Scan or type SKU"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={loading || !skuInput.trim()}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Looking up…
                </>
              ) : (
                <>
                  <ScanBarcode className="size-4" />
                  Find product
                </>
              )}
            </Button>
          </form>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          {item ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <LineItemImage src={item.imageUrl} alt={item.productTitle} />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium leading-snug">{item.displayName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-mono text-xs">
                      SKU {item.sku}
                    </Badge>
                    {item.barcode ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        Barcode {item.barcode}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        No Shopify barcode — using SKU
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <div className="space-y-1.5">
                  <label
                    htmlFor="stock-label-name"
                    className="text-sm font-medium"
                  >
                    Name on label
                  </label>
                  <Input
                    id="stock-label-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="M8 A2 Nyloc Nuts Stainless Steel"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="stock-label-copies"
                    className="text-sm font-medium"
                  >
                    Sheets
                  </label>
                  <Input
                    id="stock-label-copies"
                    inputMode="numeric"
                    value={copies}
                    onChange={(event) => setCopies(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="stock-label-barcode"
                  className="text-sm font-medium"
                >
                  Barcode value
                </label>
                <Input
                  id="stock-label-barcode"
                  value={barcodeValue}
                  onChange={(event) => setBarcodeValue(event.target.value)}
                  placeholder="Barcode or SKU to encode"
                  className="font-mono"
                  autoComplete="off"
                />
                {usingSkuFallback ? (
                  <p className="text-xs text-muted-foreground">
                    This variant has no barcode in Shopify, so the SKU is
                    encoded instead.
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                disabled={
                  !labelUrl || !productName.trim() || !barcodeValue.trim()
                }
                onClick={() => {
                  if (labelUrl) {
                    window.open(labelUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Printer className="size-4" />
                Print stock labels
              </Button>
            </div>
          ) : null}
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
                {productName.trim() || "Item name"}
              </p>
              <div className="mx-auto h-6 w-full max-w-[8rem] bg-[repeating-linear-gradient(90deg,#000_0_1px,#fff_1px_3px)]" />
              <p className="font-mono text-[7px] text-zinc-600">
                {barcodeValue.trim() || "BARCODE"}
              </p>
            </div>
            <div className="border-y border-dashed border-zinc-400 py-0.5">
              <p className="text-[7px] font-bold tracking-wide text-zinc-500">
                CUT HERE
              </p>
            </div>
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-[10px] leading-tight font-semibold">
                {productName.trim() || "Item name"}
              </p>
              <div className="mx-auto h-6 w-full max-w-[8rem] bg-[repeating-linear-gradient(90deg,#000_0_1px,#fff_1px_3px)]" />
              <p className="font-mono text-[7px] text-zinc-600">
                {barcodeValue.trim() || "BARCODE"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Each sheet = 2 identical stickers. Sheets count is how many 4×6
            labels to print. Uses Shopify barcode when set, otherwise SKU.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
