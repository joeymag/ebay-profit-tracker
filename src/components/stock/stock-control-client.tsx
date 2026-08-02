"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, ScanBarcode } from "lucide-react";

import { LineItemImage } from "@/components/orders/line-item-image";
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
import { OutOfStockList } from "@/components/stock/out-of-stock-list";
import { StockReorderInsight } from "@/components/stock/stock-reorder-insight";
import type { StockSkuLookup } from "@/lib/shopify/inventory";
import { cn } from "@/lib/utils";

type LookupResponse =
  | { ok: true; item: StockSkuLookup; listings: StockSkuLookup[] }
  | { ok: false; error: string };

type SetResponse =
  | { ok: true; item: StockSkuLookup; available: number }
  | { ok: false; error: string };

function listingAvailable(listing: StockSkuLookup, locationId: number | null) {
  if (locationId != null) {
    return listing.locations.find((level) => level.locationId === locationId)?.available ?? 0;
  }
  return listing.locations.reduce((sum, level) => sum + level.available, 0);
}

export function StockControlClient() {
  const skuInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [skuInput, setSkuInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [item, setItem] = useState<StockSkuLookup | null>(null);
  const [listings, setListings] = useState<StockSkuLookup[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [outOfStockRefreshKey, setOutOfStockRefreshKey] = useState(0);

  const focusSkuInput = useCallback(() => {
    requestAnimationFrame(() => skuInputRef.current?.focus());
  }, []);

  useEffect(() => {
    focusSkuInput();
  }, [focusSkuInput]);

  async function lookupSku(rawSku?: string) {
    const sku = (rawSku ?? skuInput).trim();
    if (!sku) {
      return;
    }

    setLookupLoading(true);
    setError(null);
    setSuccess(null);
    setItem(null);
    setListings([]);

    try {
      const res = await fetch(
        `/api/shopify/inventory/lookup?sku=${encodeURIComponent(sku)}`,
      );
      const data = (await res.json()) as LookupResponse;

      if (!data.ok) {
        setError(data.error);
        focusSkuInput();
        return;
      }

      setItem(data.item);
      setListings(data.listings);
      setSkuInput(data.item.sku);
      const primaryLocation = data.item.locations[0];
      setLocationId(primaryLocation?.locationId ?? null);
      const currentQty = primaryLocation?.available ?? 0;
      setQtyInput(String(currentQty));
      requestAnimationFrame(() => {
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
      });
    } catch {
      setError("Could not look up SKU.");
      focusSkuInput();
    } finally {
      setLookupLoading(false);
    }
  }

  async function saveQuantity() {
    if (!item) {
      return;
    }

    const available = Number.parseInt(qtyInput, 10);
    if (!Number.isFinite(available) || available < 0) {
      setError("Enter a valid quantity (0 or more).");
      return;
    }

    setSaveLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/shopify/inventory/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: item.sku,
          available,
          locationId: locationId ?? undefined,
        }),
      });
      const data = (await res.json()) as SetResponse;

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setItem(data.item);
      setQtyInput(String(data.available));
      setSuccess(`Updated ${item.sku} to ${data.available} in Shopify.`);

      setSkuInput("");
      setItem(null);
      setListings([]);
      setLocationId(null);
      setOutOfStockRefreshKey((key) => key + 1);
      focusSkuInput();
    } catch {
      setError("Could not update stock.");
    } finally {
      setSaveLoading(false);
    }
  }

  function adjustQuantity(delta: number) {
    const current = Number.parseInt(qtyInput, 10);
    const base = Number.isFinite(current) ? current : 0;
    setQtyInput(String(Math.max(0, base + delta)));
    setError(null);
  }

  const selectedLocation = item?.locations.find((l) => l.locationId === locationId);
  const availableNow =
    selectedLocation?.available ??
    item?.locations.reduce((sum, level) => sum + level.available, 0) ??
    0;

  return (
    <div className="flex flex-col gap-6">
      <Card className="surface-card border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanBarcode className="size-5" />
            Scan or enter SKU
          </CardTitle>
          <CardDescription>
            Scan a barcode with your scanner, or type a SKU and press Enter. Stock
            updates go straight to Shopify inventory.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={skuInputRef}
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookupSku();
                }
              }}
              placeholder="Scan or type SKU…"
              className="h-12 text-lg font-mono"
              autoComplete="off"
              disabled={lookupLoading || saveLoading}
            />
            <Button
              type="button"
              size="lg"
              className="h-12 px-8"
              onClick={() => void lookupSku()}
              disabled={lookupLoading || saveLoading || !skuInput.trim()}
            >
              {lookupLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Looking up…
                </>
              ) : (
                "Look up"
              )}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? (
            <p className="flex items-center gap-2 text-sm text-primary">
              <Check className="size-4" />
              {success}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {item ? (
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Update quantity</CardTitle>
            <CardDescription>
              Set the available stock in Shopify for this product.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-4">
              <LineItemImage
                src={item.imageUrl}
                alt={item.productTitle}
                className="size-20"
              />
              <div className="min-w-0 space-y-2">
                <p className="text-lg font-semibold">{item.productTitle}</p>
                {item.variantTitle !== "Default Title" ? (
                  <p className="text-sm text-muted-foreground">{item.variantTitle}</p>
                ) : null}
                <Badge variant="outline" className="font-mono text-sm">
                  {item.sku}
                </Badge>
                {!item.tracked ? (
                  <p className="text-sm text-destructive">
                    Inventory tracking is off for this variant in Shopify.
                  </p>
                ) : null}
              </div>
            </div>

            <StockReorderInsight available={availableNow} sales={item} />

            {listings.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Shopify listing{listings.length === 1 ? "" : "s"} for this SKU
                  </p>
                  {listings.length > 1 ? (
                    <Badge variant="outline">
                      {listings.length} listings share this SKU
                    </Badge>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {listings.map((listing) => {
                    const stock = listingAvailable(listing, locationId);
                    return (
                      <li
                        key={`${listing.productId}-${listing.variantId}`}
                        className="flex flex-col gap-2 rounded-md border border-border/50 bg-background p-3 sm:flex-row sm:items-center"
                      >
                        <div className="flex min-w-0 flex-1 gap-3">
                          <LineItemImage
                            src={listing.imageUrl}
                            alt={listing.productTitle}
                            className="size-12 shrink-0 rounded-md"
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium leading-snug">{listing.productTitle}</p>
                            {listing.variantTitle !== "Default Title" ? (
                              <p className="text-sm text-muted-foreground">
                                {listing.variantTitle}
                              </p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              Stock on this listing:{" "}
                              <span className="font-semibold text-foreground">{stock}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:shrink-0">
                          {listing.adminUrl ? (
                            <a
                              href={listing.adminUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                            >
                              <ExternalLink className="size-3.5" />
                              Edit in Shopify
                            </a>
                          ) : null}
                          {listing.storefrontUrl ? (
                            <a
                              href={listing.storefrontUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                            >
                              <ExternalLink className="size-3.5" />
                              View listing
                            </a>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {listings.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    Saving stock here updates every listing above to the same quantity.
                  </p>
                ) : null}
              </div>
            ) : null}

            {item.locations.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Location</p>
                <div className="flex flex-wrap gap-2">
                  {item.locations.map((location) => (
                    <Button
                      key={location.locationId}
                      type="button"
                      size="sm"
                      variant={
                        locationId === location.locationId ? "default" : "outline"
                      }
                      onClick={() => {
                        setLocationId(location.locationId);
                        setQtyInput(String(location.available));
                      }}
                    >
                      {location.locationName} ({location.available})
                    </Button>
                  ))}
                </div>
              </div>
            ) : selectedLocation ? (
              <p className="text-sm text-muted-foreground">
                Location: {selectedLocation.locationName} · current:{" "}
                <span className="font-semibold text-foreground">
                  {selectedLocation.available}
                </span>
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  New quantity
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-12 text-lg"
                    onClick={() => adjustQuantity(-1)}
                    disabled={saveLoading}
                  >
                    −
                  </Button>
                  <Input
                    ref={qtyInputRef}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveQuantity();
                      }
                    }}
                    inputMode="numeric"
                    className="h-12 w-28 text-center text-2xl font-semibold tabular-nums"
                    disabled={saveLoading || !item.tracked}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-12 text-lg"
                    onClick={() => adjustQuantity(1)}
                    disabled={saveLoading}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                size="lg"
                className="h-12 px-8"
                onClick={() => void saveQuantity()}
                disabled={saveLoading || !item.tracked}
              >
                {saveLoading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Update Shopify stock"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <OutOfStockList
        refreshKey={outOfStockRefreshKey}
        onSelectSku={(sku) => {
          setSkuInput(sku);
          void lookupSku(sku);
        }}
      />
    </div>
  );
}
