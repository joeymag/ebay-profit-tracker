"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, ScanBarcode } from "lucide-react";

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

type SetResponse =
  | { ok: true; item: StockSkuLookup; available: number }
  | { ok: false; error: string };

export function StockControlClient() {
  const skuInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const [skuInput, setSkuInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [item, setItem] = useState<StockSkuLookup | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setLocationId(null);
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
    </div>
  );
}
