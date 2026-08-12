"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Package, Printer } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FulfillmentOrderOption = {
  id: string;
  status: string;
  fulfillable: boolean;
  destinationName: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  locationName: string | null;
  lineItemCount: number;
  buyerDeliveryName: string | null;
  buyerServiceCode: string | null;
};

type PurchasedLabelInfo = {
  id: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  documentUrl: string | null;
};

type OptionsResponse =
  | {
      ok: true;
      fulfillmentOrders: FulfillmentOrderOption[];
      shopifyAdminUrl: string | null;
      shopifyCreateLabelUrl?: string | null;
      fulfillmentStatus: string | null;
      purchasedLabel: PurchasedLabelInfo | null;
      shippingLabelGid: string | null;
    }
  | { ok: false; error: string; hint?: string };

type PurchaseResponse =
  | {
      ok: true;
      status: string;
      done: boolean;
      postageCost: number | null;
      latestLabelCost?: number | null;
      labels: Array<{
        id?: string;
        trackingNumber: string | null;
        trackingUrl: string | null;
        documentUrl: string | null;
      }>;
      message: string;
    }
  | { ok: false; error: string; hint?: string };

const PACKAGE_STORAGE_KEY = "shopify-label-package-defaults";

type PackageDefaults = {
  totalWeightGrams: string;
  packageWeightGrams: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
};

const DEFAULT_PACKAGE: PackageDefaults = {
  totalWeightGrams: "500",
  packageWeightGrams: "50",
  lengthCm: "20",
  widthCm: "15",
  heightCm: "10",
};

type BuyShippingLabelCardProps = {
  shopifyId: number;
  alreadyHasPostage: boolean;
  shippingLabelGid?: string | null;
};

export function BuyShippingLabelCard({
  shopifyId,
  alreadyHasPostage,
  shippingLabelGid = null,
}: BuyShippingLabelCardProps) {
  const router = useRouter();
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsHint, setOptionsHint] = useState<string | null>(null);
  const [fulfillmentOrders, setFulfillmentOrders] = useState<
    FulfillmentOrderOption[]
  >([]);
  const [shopifyAdminUrl, setShopifyAdminUrl] = useState<string | null>(null);
  const [shopifyCreateLabelUrl, setShopifyCreateLabelUrl] = useState<
    string | null
  >(null);
  const [selectedFoId, setSelectedFoId] = useState("");
  const [pkg, setPkg] = useState<PackageDefaults>(DEFAULT_PACKAGE);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [confirmBlindBuy, setConfirmBlindBuy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [purchasedLabelId, setPurchasedLabelId] = useState<string | null>(
    shippingLabelGid,
  );
  const [purchasedLabelCost, setPurchasedLabelCost] = useState<number | null>(
    null,
  );
  const [buildingPackSheet, setBuildingPackSheet] = useState(false);

  useEffect(() => {
    setPurchasedLabelId(shippingLabelGid);
  }, [shippingLabelGid]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PACKAGE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<PackageDefaults>;
      setPkg((current) => ({ ...current, ...parsed }));
    } catch {
      // Ignore private-mode / bad JSON.
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setOptionsError(null);
    setOptionsHint(null);

    try {
      const response = await fetch(
        `/api/shopify/orders/${shopifyId}/shipping-label`,
      );
      const payload = (await response.json()) as OptionsResponse;
      if (!payload.ok) {
        setFulfillmentOrders([]);
        setOptionsError(payload.error);
        setOptionsHint(payload.hint ?? null);
        return;
      }

      setFulfillmentOrders(payload.fulfillmentOrders);
      setShopifyAdminUrl(payload.shopifyAdminUrl);
      setShopifyCreateLabelUrl(
        payload.shopifyCreateLabelUrl ?? payload.shopifyAdminUrl,
      );
      setSelectedFoId(payload.fulfillmentOrders[0]?.id ?? "");

      const purchased = payload.purchasedLabel;
      if (purchased?.id) {
        setPurchasedLabelId(purchased.id);
        if (purchased.documentUrl) {
          setLabelUrl(purchased.documentUrl);
        }
      } else if (payload.shippingLabelGid) {
        setPurchasedLabelId(payload.shippingLabelGid);
      }
    } catch {
      setOptionsError("Could not load shipping label options from Shopify.");
    } finally {
      setLoadingOptions(false);
    }
  }, [shopifyId]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  function updatePackage(patch: Partial<PackageDefaults>) {
    setPkg((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore.
      }
      return next;
    });
  }

  async function openPackSheet(options?: {
    documentUrl?: string | null;
    shippingLabelId?: string | null;
    test?: boolean;
  }) {
    setBuildingPackSheet(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${shopifyId}/pack-sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          options?.test
            ? { test: true }
            : {
                labelDocumentUrl: options?.documentUrl || undefined,
                shippingLabelId:
                  options?.shippingLabelId || purchasedLabelId || undefined,
              },
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Could not build A4 pack sheet.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not build A4 pack sheet.",
      );
    } finally {
      setBuildingPackSheet(false);
    }
  }

  async function pollLabelCost(): Promise<number | null> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      try {
        const response = await fetch(
          `/api/shopify/orders/label-cost?id=${shopifyId}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          latestLabelCost?: number | null;
          shippingLabelCost?: number | null;
        };
        if (!payload.ok) {
          continue;
        }
        if (payload.latestLabelCost != null && payload.latestLabelCost > 0) {
          return payload.latestLabelCost;
        }
        if (payload.shippingLabelCost != null && payload.shippingLabelCost > 0) {
          return payload.shippingLabelCost;
        }
      } catch {
        // Keep polling.
      }
    }
    return null;
  }

  async function buyLabel() {
    setPurchasing(true);
    setError(null);
    setMessage(null);
    setLabelUrl(null);
    setPurchasedLabelCost(null);

    try {
      const response = await fetch(
        `/api/shopify/orders/${shopifyId}/shipping-label/purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fulfillmentOrderId: selectedFoId,
            totalWeightGrams: Number.parseFloat(pkg.totalWeightGrams),
            packageWeightGrams: Number.parseFloat(pkg.packageWeightGrams),
            lengthCm: Number.parseFloat(pkg.lengthCm),
            widthCm: Number.parseFloat(pkg.widthCm),
            heightCm: Number.parseFloat(pkg.heightCm),
            notifyCustomer,
          }),
        },
      );
      const payload = (await response.json()) as PurchaseResponse;

      if (!payload.ok) {
        setError(
          [payload.error, payload.hint].filter(Boolean).join(" — ") ||
            "Purchase failed.",
        );
        return;
      }

      const firstLabel = payload.labels[0];
      const documentUrl = firstLabel?.documentUrl ?? null;
      const labelId = firstLabel?.id ?? null;
      setLabelUrl(documentUrl);
      if (labelId) {
        setPurchasedLabelId(labelId);
      }

      let labelCost =
        payload.latestLabelCost ??
        (payload.postageCost != null && payload.postageCost > 0
          ? payload.postageCost
          : null);
      if (labelCost == null && payload.status === "PURCHASED") {
        labelCost = await pollLabelCost();
      }
      setPurchasedLabelCost(labelCost);
      setConfirmBlindBuy(false);

      setMessage(
        [
          payload.message,
          labelCost == null && payload.status === "PURCHASED"
            ? "Label cost not in Shopify timeline yet — check again shortly."
            : null,
          firstLabel?.trackingNumber
            ? `Tracking: ${firstLabel.trackingNumber}.`
            : null,
          documentUrl || labelId
            ? "Opening A4 pack sheet (label + pick list)…"
            : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      router.refresh();
      await loadOptions();
      if (documentUrl || labelId) {
        await openPackSheet({
          documentUrl,
          shippingLabelId: labelId,
        });
      }
    } catch {
      setError("Could not reach the shipping label purchase endpoint.");
    } finally {
      setPurchasing(false);
    }
  }

  const canPurchase =
    Boolean(selectedFoId) &&
    fulfillmentOrders.length > 0 &&
    confirmBlindBuy &&
    !purchasing &&
    !loadingOptions &&
    !buildingPackSheet;

  const canReprint =
    Boolean(purchasedLabelId || labelUrl) &&
    !purchasing &&
    !loadingOptions &&
    !buildingPackSheet;

  const selectedFo =
    fulfillmentOrders.find((fo) => fo.id === selectedFoId) ?? null;

  const ratesUrl = shopifyCreateLabelUrl ?? shopifyAdminUrl;

  return (
    <Card className="surface-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Package className="size-5" />
              Buy shipping label
            </CardTitle>
            <CardDescription>
              To see carrier and price (Evri, DPD, Royal Mail, etc.) before you
              pay, open Shopify&apos;s Create shipping label screen. In-app buy
              can only purchase Shopify&apos;s default/cheapest rate with no
              preview — some labels can be expensive.
              {alreadyHasPostage
                ? " This order already has a postage cost saved."
                : null}
              {purchasedLabelId
                ? " A purchased label is on file for reprint."
                : null}
            </CardDescription>
          </div>
          {shopifyAdminUrl ? (
            <a
              href={shopifyAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open order in Shopify
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ratesUrl && fulfillmentOrders.length > 0 ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-3">
            <p className="text-sm font-medium">
              Recommended: see cost &amp; carrier before buying
            </p>
            <p className="text-sm text-muted-foreground">
              In Shopify Admin, open{" "}
              <span className="font-medium">Create shipping label</span>, enter
              the package weight (rates only appear after weight is set), then
              pick Evri / DPD / Royal Mail with the £ price shown. Our app cannot
              load that rate list — Shopify keeps it in Admin only.
            </p>
            <a
              href={ratesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "default" }))}
            >
              See prices in Shopify
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void openPackSheet({ test: true })}
            disabled={purchasing || loadingOptions || buildingPackSheet}
          >
            {buildingPackSheet ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building test sheet…
              </>
            ) : (
              <>
                <Printer className="size-4" />
                Print test A4 sheet
              </>
            )}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Prints a Royal Mail S19 layout test (160×105mm label at the bottom,
            pick list above the perforation) using this order. Print at 100%
            scale — do not fit to page.
          </p>
        </div>

        {canReprint ? (
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
            <Button
              type="button"
              onClick={() =>
                void openPackSheet({
                  documentUrl: labelUrl,
                  shippingLabelId: purchasedLabelId,
                })
              }
              disabled={!canReprint}
            >
              {buildingPackSheet ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Building A4 sheet…
                </>
              ) : (
                <>
                  <Printer className="size-4" />
                  Reprint A4 pack sheet
                </>
              )}
            </Button>
            {labelUrl ? (
              <a
                href={labelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Open label PDF only
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
        ) : null}

        {loadingOptions ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading fulfillment options…
          </p>
        ) : optionsError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p>{optionsError}</p>
            {optionsHint ? (
              <p className="mt-2 text-muted-foreground">{optionsHint}</p>
            ) : null}
          </div>
        ) : fulfillmentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {purchasedLabelId
              ? "No open fulfillment left to buy another label. Use Reprint A4 pack sheet above."
              : "No open fulfillment orders left to ship. If the order is already fulfilled, buy/reprint labels in Shopify Admin."}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="label-fo">
                Fulfillment order
              </label>
              <select
                id="label-fo"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={selectedFoId}
                onChange={(event) => setSelectedFoId(event.target.value)}
                disabled={purchasing}
              >
                {fulfillmentOrders.map((fo) => (
                  <option key={fo.id} value={fo.id}>
                    {fo.lineItemCount} item
                    {fo.lineItemCount === 1 ? "" : "s"}
                    {fo.destinationCity ? ` → ${fo.destinationCity}` : ""}
                    {fo.destinationCountry ? `, ${fo.destinationCountry}` : ""}
                    {fo.locationName ? ` · from ${fo.locationName}` : ""}
                  </option>
                ))}
              </select>
              {selectedFo?.buyerDeliveryName || selectedFo?.buyerServiceCode ? (
                <p className="text-sm text-muted-foreground">
                  Buyer chose at checkout:{" "}
                  <span className="font-medium text-foreground">
                    {selectedFo.buyerDeliveryName ||
                      selectedFo.buyerServiceCode}
                  </span>
                  {selectedFo.buyerDeliveryName && selectedFo.buyerServiceCode
                    ? ` (${selectedFo.buyerServiceCode})`
                    : null}
                  . That is not a live Shopify Shipping rate quote.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No buyer delivery method on this fulfillment order. Live
                  carrier rates are only shown in Shopify Admin.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ["totalWeightGrams", "Total weight (g)"],
                  ["packageWeightGrams", "Box weight (g)"],
                  ["lengthCm", "Length (cm)"],
                  ["widthCm", "Width (cm)"],
                  ["heightCm", "Height (cm)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={`pkg-${key}`}>
                    {label}
                  </label>
                  <Input
                    id={`pkg-${key}`}
                    inputMode="decimal"
                    value={pkg[key]}
                    onChange={(event) =>
                      updatePackage({ [key]: event.target.value })
                    }
                    disabled={purchasing}
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={(event) => setNotifyCustomer(event.target.checked)}
                className="size-4 rounded border-input accent-primary"
                disabled={purchasing}
              />
              Notify customer after purchase
            </label>

            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                Buy cheapest in-app (no price/carrier preview)
              </p>
              <p className="text-sm text-muted-foreground">
                Shopify may choose Evri, DPD, Royal Mail, or another service. You
                will not see the cost until after purchase — it can occasionally
                be high (e.g. £60). Prefer{" "}
                <span className="font-medium">See prices in Shopify</span> unless
                you are sure.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmBlindBuy}
                  onChange={(event) =>
                    setConfirmBlindBuy(event.target.checked)
                  }
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                  disabled={purchasing}
                />
                <span>
                  I understand I won&apos;t see carrier or price before buying,
                  and I still want the cheapest Shopify Shipping rate.
                </span>
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void buyLabel()}
                disabled={!canPurchase}
              >
                {purchasing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Buying label…
                  </>
                ) : (
                  "Buy cheapest without preview"
                )}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadOptions()}
                disabled={purchasing || buildingPackSheet}
              >
                Refresh
              </Button>
            </div>
          </>
        )}

        {message ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {purchasedLabelCost != null ? (
              <p className="mb-2 text-2xl font-semibold tabular-nums tracking-tight text-emerald-900 dark:text-emerald-100">
                Label cost: £{purchasedLabelCost.toFixed(2)}
              </p>
            ) : null}
            <p>{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canReprint ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void openPackSheet({
                      documentUrl: labelUrl,
                      shippingLabelId: purchasedLabelId,
                    })
                  }
                  disabled={buildingPackSheet}
                >
                  {buildingPackSheet ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Building A4 sheet…
                    </>
                  ) : (
                    "Print A4 pack sheet"
                  )}
                </Button>
              ) : null}
              {labelUrl ? (
                <a
                  href={labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  Open label PDF only
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
