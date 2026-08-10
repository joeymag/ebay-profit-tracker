"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2, Upload } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import type {
  EbayListingDetails,
  EbayListingVariation,
  EbayVariationEdit,
} from "@/lib/ebay/listing-details";
import {
  computeEbayFees,
  formatEbayFinalValueFeeSchedule,
  type EbayFees,
} from "@/lib/orders/platform-fees";
import { cn } from "@/lib/utils";

type DetailsResponse =
  | { ok: true; listing: EbayListingDetails }
  | { ok: false; error: string; code?: string; details?: string };

type ReviseResponse =
  | {
      ok: true;
      listingId: string;
      updatedCount: number;
      ack: string | null;
      warnings: string[];
    }
  | { ok: false; error: string; details?: string };

type DraftRow = {
  sku: string;
  price: string;
};

const SELLING_FEE_STORAGE_KEY = "ebay-listing-selling-fee-percent";
const DEFAULT_SELLING_FEE_PERCENT = "12.8";

function formatQty(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
}

function draftsFromVariations(variations: EbayListingVariation[]): DraftRow[] {
  return variations.map((row) => ({
    sku: row.sku ?? "",
    price: row.price != null ? String(row.price) : "",
  }));
}

function sameDraft(a: DraftRow, b: DraftRow): boolean {
  return a.sku.trim() === b.sku.trim() && a.price.trim() === b.price.trim();
}

function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function feeEstimateTitle(fees: EbayFees): string {
  const parts = [`FVF ${formatMoney(fees.finalValueFee)}`];
  if (fees.sellingFee != null) {
    parts.push(`Selling ${formatMoney(fees.sellingFee)}`);
  }
  if (fees.adsFee != null) {
    parts.push(`Promo ${formatMoney(fees.adsFee)}`);
  }
  return parts.join(" · ");
}

type ListingVariationsPanelProps = {
  listingId: string;
};

export function ListingVariationsPanel({ listingId }: ListingVariationsPanelProps) {
  const [listing, setListing] = useState<EbayListingDetails | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<Extract<DetailsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sellingFeePercent, setSellingFeePercent] = useState(
    DEFAULT_SELLING_FEE_PERCENT,
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SELLING_FEE_STORAGE_KEY);
      if (stored != null && stored.trim() !== "") {
        setSellingFeePercent(stored);
      }
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/details`,
      );
      const payload = (await response.json()) as DetailsResponse;

      if (!payload.ok) {
        setListing(null);
        setDrafts([]);
        setError(payload);
        return;
      }

      setListing(payload.listing);
      setDrafts(draftsFromVariations(payload.listing.variations));
    } catch {
      setListing(null);
      setDrafts([]);
      setError({
        ok: false,
        error: "Could not reach the listing details endpoint.",
      });
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const originals = useMemo(
    () => (listing ? draftsFromVariations(listing.variations) : []),
    [listing],
  );

  const dirtyIndexes = useMemo(() => {
    const indexes: number[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const original = originals[index];
      if (!draft || !original) {
        continue;
      }
      if (!sameDraft(draft, original)) {
        indexes.push(index);
      }
    }
    return indexes;
  }, [drafts, originals]);

  const stockTotal = useMemo(() => {
    if (!listing) {
      return 0;
    }

    return listing.variations.reduce(
      (sum, row) => sum + (row.quantityAvailable ?? 0),
      0,
    );
  }, [listing]);

  const sellingFeeRate = useMemo(() => {
    const percent = parsePercentInput(sellingFeePercent);
    return percent == null ? null : percent / 100;
  }, [sellingFeePercent]);

  const promoFeeRate = useMemo(() => {
    if (listing?.promoRatePercent == null) {
      return null;
    }
    if (
      !Number.isFinite(listing.promoRatePercent) ||
      listing.promoRatePercent < 0
    ) {
      return null;
    }
    return listing.promoRatePercent / 100;
  }, [listing?.promoRatePercent]);

  const feeEstimates = useMemo(() => {
    return drafts.map((draft) => {
      const price = parseMoneyInput(draft.price);
      if (price == null) {
        return null;
      }
      return computeEbayFees(price, sellingFeeRate, promoFeeRate);
    });
  }, [drafts, promoFeeRate, sellingFeeRate]);

  function updateSellingFeePercent(value: string) {
    setSellingFeePercent(value);
    try {
      window.localStorage.setItem(SELLING_FEE_STORAGE_KEY, value);
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

  function updateDraft(index: number, patch: Partial<DraftRow>) {
    setDrafts((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
    setSaveMessage(null);
    setSaveError(null);
  }

  async function pushToEbay() {
    if (!listing || dirtyIndexes.length === 0) {
      return;
    }

    const updates: EbayVariationEdit[] = [];

    for (const index of dirtyIndexes) {
      const draft = drafts[index]!;
      const variation = listing.variations[index]!;
      const priceRaw = draft.price.trim();
      let price: number | null = null;

      if (priceRaw !== "") {
        price = Number.parseFloat(priceRaw);
        if (!Number.isFinite(price) || price < 0) {
          setSaveError(`Invalid price on row ${index + 1}.`);
          return;
        }
      } else {
        setSaveError(`Price is required on row ${index + 1}.`);
        return;
      }

      updates.push({
        originalSku: variation.sku,
        sku: draft.sku.trim() || null,
        price,
        specificsPairs: variation.specificsPairs,
      });
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch(
        `/api/ebay/listings/${encodeURIComponent(listingId)}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isMultiVariation: listing.isMultiVariation,
            format: listing.format,
            currency: listing.currency ?? "GBP",
            variations: updates,
          }),
        },
      );
      const payload = (await response.json()) as ReviseResponse;

      if (!payload.ok) {
        setSaveError(
          [payload.error, payload.details].filter(Boolean).join(" — "),
        );
        return;
      }

      const warningText = payload.warnings.length
        ? ` Warnings: ${payload.warnings.slice(0, 2).join(" · ")}`
        : "";
      setSaveMessage(
        `Pushed ${payload.updatedCount} update${payload.updatedCount === 1 ? "" : "s"} to eBay (${payload.ack ?? "Success"}).${warningText}`,
      );
      await load();
    } catch {
      setSaveError("Could not reach the eBay revise endpoint.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading variations from eBay…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Could not load listing</CardTitle>
          <CardDescription>{error.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/ebay-listings" className={cn(buttonVariants({ variant: "outline" }))}>
              Back to listings
            </Link>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
          {error.details ? (
            <p className="font-mono text-xs text-muted-foreground">{error.details}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/ebay-listings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="size-4" />
          All listings
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={saving}
        >
          Refresh
        </Button>
        <a
          href={listing.itemWebUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        >
          Open on eBay
          <ExternalLink className="size-3.5" />
        </a>
        <Button
          type="button"
          size="sm"
          onClick={() => void pushToEbay()}
          disabled={saving || dirtyIndexes.length === 0}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Pushing to eBay…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Push {dirtyIndexes.length || ""} change
              {dirtyIndexes.length === 1 ? "" : "s"} to eBay
            </>
          )}
        </Button>
      </div>

      {saveMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>{saveMessage}</p>
        </div>
      ) : null}
      {saveError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {saveError}
        </div>
      ) : null}

      <Card className="surface-card">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap gap-4">
            <LineItemImage
              src={listing.imageUrl}
              alt={listing.title ?? listing.listingId}
              className="size-20"
            />
            <div className="min-w-0 space-y-2">
              <CardTitle className="text-xl leading-snug">
                {listing.title ?? `Listing ${listing.listingId}`}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{listing.listingId}</span>
                {listing.isMultiVariation ? (
                  <Badge variant="secondary">
                    {listing.variations.length} variations
                  </Badge>
                ) : (
                  <Badge variant="outline">Single SKU</Badge>
                )}
                {listing.promoRatePercent != null ? (
                  <Badge
                    variant="secondary"
                    className="tabular-nums"
                    title={listing.promoCampaignName ?? undefined}
                  >
                    Promo {listing.promoRatePercent.toFixed(
                      listing.promoRatePercent % 1 === 0 ? 0 : 1,
                    )}
                    %
                  </Badge>
                ) : (
                  <Badge variant="outline">No promo</Badge>
                )}
                {listing.status ? (
                  <Badge variant="outline">
                    {listing.status.replaceAll("_", " ").toLowerCase()}
                  </Badge>
                ) : null}
                {dirtyIndexes.length > 0 ? (
                  <Badge variant="destructive">
                    {dirtyIndexes.length} unsaved
                  </Badge>
                ) : null}
              </CardDescription>
              {listing.promoWarning ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {listing.promoWarning}{" "}
                  <Link href="/settings" className="underline underline-offset-2">
                    Settings
                  </Link>
                </p>
              ) : listing.promoCampaignName ? (
                <p className="text-sm text-muted-foreground">
                  Campaign: {listing.promoCampaignName}
                  {listing.promoAdStatus ? ` · ${listing.promoAdStatus}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Total available stock across rows:{" "}
                <span className="tabular-nums text-foreground">
                  {stockTotal.toLocaleString("en-GB")}
                </span>
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>
                {listing.isMultiVariation ? "Variations" : "Listing stock"}
              </CardTitle>
              <CardDescription>
                Est. fees use FVF ({formatEbayFinalValueFeeSchedule()}), your
                selling fee % (+VAT), and this listing&apos;s promo rate (+VAT).
                Updates live as you edit price.
              </CardDescription>
            </div>
            <div className="w-full max-w-[11rem] space-y-1.5">
              <label
                htmlFor="listing-selling-fee"
                className="text-sm font-medium leading-none"
              >
                Selling fee %
              </label>
              <div className="relative">
                <Input
                  id="listing-selling-fee"
                  value={sellingFeePercent}
                  onChange={(event) =>
                    updateSellingFeePercent(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="12.8"
                  className="pr-7 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%] pl-6">Variation</TableHead>
                  <TableHead className="w-[18%]">SKU</TableHead>
                  <TableHead className="w-[14%]">Price</TableHead>
                  <TableHead className="w-[14%] text-right">Est. fees</TableHead>
                  <TableHead className="w-[11%] text-right">Available</TableHead>
                  <TableHead className="w-[11%] text-right">Sold</TableHead>
                  <TableHead className="w-[12%] pr-6 text-right">Listed qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.variations.map((row, index) => {
                  const draft = drafts[index] ?? { sku: "", price: "" };
                  const dirty = dirtyIndexes.includes(index);
                  const currency = row.currency ?? listing.currency ?? "GBP";
                  const fees = feeEstimates[index] ?? null;

                  return (
                    <TableRow
                      key={`${row.sku ?? "nosku"}-${index}`}
                      className={dirty ? "bg-amber-500/5" : undefined}
                    >
                      <TableCell className="min-w-0 whitespace-normal pl-6 align-top">
                        <p className="break-words text-sm font-medium leading-snug">
                          {row.specifics || "—"}
                        </p>
                        {dirty ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Edited
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-0 align-top whitespace-normal">
                        <Input
                          value={draft.sku}
                          onChange={(event) =>
                            updateDraft(index, { sku: event.target.value })
                          }
                          placeholder="SKU"
                          className="font-mono text-sm"
                          disabled={saving}
                        />
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
                        <div className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                            {currency === "GBP" ? "£" : currency}
                          </span>
                          <Input
                            value={draft.price}
                            onChange={(event) =>
                              updateDraft(index, { price: event.target.value })
                            }
                            inputMode="decimal"
                            placeholder="0.00"
                            className="pl-7 text-right tabular-nums"
                            disabled={saving}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {fees ? (
                          <div
                            className="space-y-0.5"
                            title={feeEstimateTitle(fees)}
                          >
                            <p className="tabular-nums font-medium">
                              {formatMoney(fees.total, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {fees.adsFee != null
                                ? `incl. promo ${formatMoney(fees.adsFee, currency)}`
                                : "no promo"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums align-middle font-medium">
                        {formatQty(row.quantityAvailable)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums align-middle text-muted-foreground">
                        {formatQty(row.quantitySold)}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums align-middle text-muted-foreground">
                        {formatQty(row.quantity)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
