"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Printer, ScanBarcode } from "lucide-react";

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

export function ProductBagLabelPanel({ initialSku = "" }: { initialSku?: string }) {
  const [skuInput, setSkuInput] = useState(initialSku);
  const [item, setItem] = useState<StockSkuLookup | null>(null);
  const [productName, setProductName] = useState("");
  const [copies, setCopies] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelUrl = useMemo(() => {
    const sku = (item?.sku ?? skuInput).trim();
    if (!sku) {
      return null;
    }
    const params = new URLSearchParams({ sku });
    const title = productName.trim();
    if (title) {
      params.set("title", title);
    }
    const copyCount = Number.parseInt(copies, 10);
    if (Number.isFinite(copyCount) && copyCount > 1) {
      params.set("copies", String(Math.min(50, copyCount)));
    }
    return `/api/products/label?${params.toString()}`;
  }, [copies, item?.sku, productName, skuInput]);

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
          <CardTitle>Print a 4×6 bag label</CardTitle>
          <CardDescription>
            Logo and black tstrade.co.uk at the top, product name in the middle,
            scan/app instructions, then a clear cut line. Bottom stub is 75mm
            with centered name and QR to the website product page.
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
              <label htmlFor="bag-label-sku" className="text-sm font-medium">
                SKU
              </label>
              <Input
                id="bag-label-sku"
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
                  <Badge variant="outline" className="font-mono text-xs">
                    {item.sku}
                  </Badge>
                  {item.storefrontUrl ? (
                    <a
                      href={item.storefrontUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Product page
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <p className="text-sm text-destructive">
                      No website product page found for this SKU.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <div className="space-y-1.5">
                  <label htmlFor="bag-label-name" className="text-sm font-medium">
                    Name on label
                  </label>
                  <Input
                    id="bag-label-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="M8 A2 Nyloc Nuts Stainless Steel"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="bag-label-copies" className="text-sm font-medium">
                    Copies
                  </label>
                  <Input
                    id="bag-label-copies"
                    inputMode="numeric"
                    value={copies}
                    onChange={(event) => setCopies(event.target.value)}
                  />
                </div>
              </div>

              <Button
                type="button"
                disabled={!labelUrl || !item.storefrontUrl || !productName.trim()}
                onClick={() => {
                  if (labelUrl) {
                    window.open(labelUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Printer className="size-4" />
                Print 4×6 label
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="surface-card h-fit">
        <CardHeader>
          <CardTitle>Label layout</CardTitle>
          <CardDescription>4" wide × 6" tall thermal label.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mx-auto w-[11rem] rounded-sm border border-foreground/30 bg-white p-3 text-center text-zinc-900 shadow-sm">
            <p className="text-[10px] font-bold tracking-wide text-black">
              tstrade.co.uk
            </p>
            <div className="mt-6 mb-3 space-y-1 px-1">
              <p className="text-[11px] leading-tight font-semibold">
                {productName.trim() || "Product name"}
              </p>
              <p className="text-[7px] leading-snug text-zinc-700">
                Scan QR with your camera or download our app to take you to the
                product page
              </p>
            </div>
            <div className="border-y-2 border-black py-1">
              <p className="text-[8px] font-bold tracking-wide">CUT HERE</p>
            </div>
            <div className="mt-3 flex flex-col items-center gap-2">
              <p className="text-[10px] leading-tight font-semibold">
                {productName.trim() || "Product name"}
              </p>
              <div className="size-10 shrink-0 border border-zinc-900 bg-[repeating-conic-gradient(#000_0_25%,#fff_0_50%)] bg-[length:5px_5px]" />
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            4×6 label · bottom stub 75mm. Print on a 4×6 printer. The QR opens
            the product page on tstrade.co.uk.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
