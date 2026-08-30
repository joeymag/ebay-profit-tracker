"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Loader2, Save, Sparkles, Upload } from "lucide-react";

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
import { variationRowNeedsSku } from "@/lib/ebay/listing-sku-status";
import {
  calculateEbayItemProfit,
  formatEbayFinalValueFeeSchedule,
  PRODUCT_COST_VAT_RATE,
} from "@/lib/orders/ebay-profit-calculator";
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

type GenerateSkuResponse =
  | {
      ok: true;
      successCount: number;
      failureCount: number;
      results: Array<{
        listingId: string;
        ok: boolean;
        skus?: Array<{ specifics: string; sku: string }>;
        error?: string;
      }>;
    }
  | { ok: false; error: string };

type DraftRow = {
  sku: string;
  price: string;
  unitCost: string;
  postage: string;
};

const SELLING_FEE_STORAGE_KEY = "ebay-listing-selling-fee-percent";
const DEFAULT_SELLING_FEE_PERCENT = "12.8";

function formatQty(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-GB");
}

function moneyDraft(value: number | null | undefined): string {
  return value != null ? String(value) : "";
}

function draftsFromVariations(variations: EbayListingVariation[]): DraftRow[] {
  return variations.map((row) => ({
    sku: row.sku ?? "",
    price: row.price != null ? String(row.price) : "",
    unitCost: moneyDraft(row.unitCost),
    postage: moneyDraft(row.postageCost),
  }));
}

function sameEbayDraft(a: DraftRow, b: DraftRow): boolean {
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

function feeEstimateTitle(fees: {
  finalValueFee: number;
  sellingFee: number | null;
  adsFee: number | null;
}): string {
  const parts = [`FVF ${formatMoney(fees.finalValueFee)}`];
  if (fees.sellingFee != null) {
    parts.push(`Selling ${formatMoney(fees.sellingFee)}`);
  }
  if (fees.adsFee != null) {
    parts.push(`Promo ${formatMoney(fees.adsFee)}`);
  }
  return parts.join(" · ");
}

function MoneyDraftInput({
  value,
  onChange,
  onBlur,
  disabled,
  currency = "GBP",
  placeholder = "0.00",
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  currency?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        {currency === "GBP" ? "£" : currency}
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-7 text-right tabular-nums"
        disabled={disabled}
      />
    </div>
  );
}

type ListingVariationsPanelProps = {
  listingId: string;
};

export function ListingVariationsPanel({ listingId }: ListingVariationsPanelProps) {
  const [listing, setListing] = useState<EbayListingDetails | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState<Extract<DetailsResponse, { ok: false }> | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [generatingSkus, setGeneratingSkus] = useState(false);
  const [skuPrefix, setSkuPrefix] = useState("EBAY");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sellingFeePercent, setSellingFeePercent] = useState(
    DEFAULT_SELLING_FEE_PERCENT,
  );
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const [bulkPostage, setBulkPostage] = useState("");

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
        setTitleDraft("");
        setDrafts([]);
        setSelectedIndexes(new Set());
        setError(payload);
        return;
      }

      setListing(payload.listing);
      setTitleDraft(payload.listing.title ?? "");
      setDrafts(draftsFromVariations(payload.listing.variations));
      setSelectedIndexes(
        new Set(payload.listing.variations.map((_, index) => index)),
      );
    } catch {
      setListing(null);
      setTitleDraft("");
      setDrafts([]);
      setSelectedIndexes(new Set());
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

  const titleDirty = useMemo(() => {
    if (!listing) {
      return false;
    }

    return titleDraft.trim() !== (listing.title ?? "").trim();
  }, [listing, titleDraft]);

  const dirtyIndexes = useMemo(() => {
    const indexes: number[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const original = originals[index];
      if (!draft || !original) {
        continue;
      }
      if (!sameEbayDraft(draft, original)) {
        indexes.push(index);
      }
    }
    return indexes;
  }, [drafts, originals]);

  const dirtyCostIndexes = useMemo(() => {
    if (!listing) {
      return [] as number[];
    }

    const indexes: number[] = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const variation = listing.variations[index];
      if (!draft || !variation) {
        continue;
      }

      const originalCost = moneyDraft(variation.unitCost);
      const originalPostage = moneyDraft(variation.postageCost);
      if (
        draft.unitCost.trim() !== originalCost.trim() ||
        draft.postage.trim() !== originalPostage.trim()
      ) {
        indexes.push(index);
      }
    }
    return indexes;
  }, [drafts, listing]);

  const stockTotal = useMemo(() => {
    if (!listing) {
      return 0;
    }

    return listing.variations.reduce(
      (sum, row) => sum + (row.quantityAvailable ?? 0),
      0,
    );
  }, [listing]);

  const feeEstimates = useMemo(() => {
    const sellingPercent = parsePercentInput(sellingFeePercent) ?? 0;
    const promoPercent = listing?.promoRatePercent ?? 0;

    return drafts.map((draft) => {
      const price = parseMoneyInput(draft.price);
      const unitCost = parseMoneyInput(draft.unitCost);
      if (price == null || unitCost == null) {
        return null;
      }

      return calculateEbayItemProfit({
        sellPrice: price,
        productCostExVat: unitCost,
        ebayFeeRatePercent: sellingPercent,
        ebayAdsFeeRatePercent: promoPercent,
        postage: parseMoneyInput(draft.postage) ?? 0,
      });
    });
  }, [drafts, listing?.promoRatePercent, sellingFeePercent]);

  const missingSkuIndexes = useMemo(() => {
    if (!listing) {
      return [] as number[];
    }

    return listing.variations
      .map((variation, index) => {
        const draft = drafts[index];
        if (
          variationRowNeedsSku(
            draft?.sku ?? "",
            variation.sku,
            listing.listingId,
          )
        ) {
          return index;
        }
        return null;
      })
      .filter((index): index is number => index != null);
  }, [drafts, listing]);

  const selectedMissingSkuIndexes = useMemo(
    () => missingSkuIndexes.filter((index) => selectedIndexes.has(index)),
    [missingSkuIndexes, selectedIndexes],
  );

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

  const allRowsSelected =
    drafts.length > 0 && selectedIndexes.size === drafts.length;
  const someRowsSelected =
    selectedIndexes.size > 0 && selectedIndexes.size < drafts.length;

  function toggleRowSelected(index: number, checked: boolean) {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIndexes(new Set());
      return;
    }
    setSelectedIndexes(new Set(drafts.map((_, index) => index)));
  }

  function applyBulkPostage() {
    const trimmed = bulkPostage.trim();
    if (trimmed === "") {
      setSaveError("Enter a postage amount to apply.");
      return;
    }

    const amount = Number.parseFloat(trimmed);
    if (!Number.isFinite(amount) || amount < 0) {
      setSaveError("Enter a valid postage amount.");
      return;
    }

    if (selectedIndexes.size === 0) {
      setSaveError("Select at least one variation to apply postage.");
      return;
    }

    const value = String(amount);
    setDrafts((current) =>
      current.map((row, index) =>
        selectedIndexes.has(index) ? { ...row, postage: value } : row,
      ),
    );
    setSaveMessage(
      `Applied £${amount.toFixed(2)} postage to ${selectedIndexes.size} variation${selectedIndexes.size === 1 ? "" : "s"}. Click Save cost / postage to keep it.`,
    );
    setSaveError(null);
  }

  function buildCostSaveItem(
    index: number,
  ):
    | {
        ok: true;
        sku: string;
        item: {
          sku: string;
          unitCost?: number | null;
          defaultPostage?: number | null;
          title: string;
        };
        costChanged: boolean;
        postageChanged: boolean;
      }
    | { ok: false; error: string } {
    if (!listing) {
      return { ok: false, error: "Listing is not loaded." };
    }

    const draft = drafts[index];
    const variation = listing.variations[index];
    if (!draft || !variation) {
      return { ok: false, error: `Missing row ${index + 1}.` };
    }

    const sku = draft.sku.trim() || variation.sku?.trim() || "";
    if (!sku) {
      return {
        ok: false,
        error: `Add a SKU on row ${index + 1} before saving costs.`,
      };
    }

    const originalCost = moneyDraft(variation.unitCost);
    const originalPostage = moneyDraft(variation.postageCost);
    const costChanged = draft.unitCost.trim() !== originalCost.trim();
    const postageChanged = draft.postage.trim() !== originalPostage.trim();

    if (!costChanged && !postageChanged) {
      return { ok: false, error: `Nothing to save on row ${index + 1}.` };
    }

    const unitCostRaw = draft.unitCost.trim();
    const postageRaw = draft.postage.trim();
    const unitCost =
      unitCostRaw === "" ? null : Number.parseFloat(unitCostRaw);
    const defaultPostage =
      postageRaw === "" ? null : Number.parseFloat(postageRaw);

    if (
      unitCostRaw !== "" &&
      (unitCost == null || !Number.isFinite(unitCost) || unitCost < 0)
    ) {
      return { ok: false, error: `Invalid product cost on row ${index + 1}.` };
    }
    if (
      postageRaw !== "" &&
      (defaultPostage == null ||
        !Number.isFinite(defaultPostage) ||
        defaultPostage < 0)
    ) {
      return { ok: false, error: `Invalid postage on row ${index + 1}.` };
    }

    return {
      ok: true,
      sku,
      costChanged,
      postageChanged,
      item: {
        sku,
        unitCost: costChanged ? unitCost : undefined,
        defaultPostage: postageChanged ? defaultPostage : undefined,
        title:
          titleDraft.trim() ||
          listing.title?.trim() ||
          variation.specifics ||
          sku,
      },
    };
  }

  async function saveCosts() {
    if (!listing || dirtyCostIndexes.length === 0) {
      return;
    }

    setSavingCosts(true);
    setSaveError(null);
    setSaveMessage(null);

    const skipped: string[] = [];
    const ebaySkuIndexes: number[] = [];
    const bulkItems: Array<{
      index: number;
      sku: string;
      costChanged: boolean;
      postageChanged: boolean;
      item: {
        sku: string;
        unitCost?: number | null;
        defaultPostage?: number | null;
        title: string;
      };
    }> = [];

    for (const index of dirtyCostIndexes) {
      const draft = drafts[index];
      const variation = listing.variations[index];
      const built = buildCostSaveItem(index);
      if (!built.ok) {
        skipped.push(`row ${index + 1}: ${built.error}`);
        continue;
      }

      bulkItems.push({
        index,
        sku: built.sku,
        costChanged: built.costChanged,
        postageChanged: built.postageChanged,
        item: built.item,
      });

      const originalSku = (variation?.sku ?? "").trim();
      if (draft && draft.sku.trim() !== originalSku) {
        ebaySkuIndexes.push(index);
      }
    }

    if (!bulkItems.length) {
      setSavingCosts(false);
      setSaveError(
        skipped.length
          ? `Nothing saved. ${skipped.join(" · ")}`
          : "Nothing to save.",
      );
      return;
    }

    let savedCount = 0;

    try {
      const response = await fetch("/api/products/bulk-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: bulkItems.map((entry) => entry.item),
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        successCount?: number;
        results?: Array<{
          sku: string;
          ok: boolean;
          error?: string;
          costs?: { unitCost: number | null; defaultPostage: number | null };
        }>;
        ordersRecalcWarning?: string | null;
      };

      if (!payload.ok) {
        setSaveError(payload.error ?? "Could not save costs.");
        return;
      }

      const resultsBySku = new Map(
        (payload.results ?? []).map((result) => [result.sku, result] as const),
      );

      savedCount = bulkItems.filter((entry) => resultsBySku.get(entry.sku)?.ok).length;

      setListing((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          variations: current.variations.map((row, rowIndex) => {
            const entry = bulkItems.find((item) => item.index === rowIndex);
            if (!entry) {
              return row;
            }

            const result = resultsBySku.get(entry.sku);
            if (!result?.ok) {
              return row;
            }

            return {
              ...row,
              sku: entry.sku || row.sku,
              unitCost: entry.costChanged
                ? (result.costs?.unitCost ?? null)
                : row.unitCost,
              postageCost: entry.postageChanged
                ? (result.costs?.defaultPostage ?? null)
                : row.postageCost,
            };
          }),
        };
      });

      for (const entry of bulkItems) {
        const result = resultsBySku.get(entry.sku);
        if (!result?.ok) {
          skipped.push(`row ${entry.index + 1}: ${result?.error ?? "Failed"}`);
        }
      }

      let ebayNote = "";
      if (ebaySkuIndexes.length > 0) {
        const updates: EbayVariationEdit[] = [];
        for (const index of ebaySkuIndexes) {
          const draft = drafts[index]!;
          const variation = listing.variations[index]!;
          const priceRaw = draft.price.trim();
          const price =
            priceRaw === "" ? variation.price : Number.parseFloat(priceRaw);
          if (price == null || !Number.isFinite(price) || price < 0) {
            skipped.push(`row ${index + 1}: need a valid price to push SKU`);
            continue;
          }
          updates.push({
            originalSku: variation.sku,
            sku: draft.sku.trim() || null,
            price,
            specificsPairs: variation.specificsPairs,
          });
        }

        if (updates.length > 0) {
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
            if (payload.ok) {
              ebayNote = ` Also pushed ${payload.updatedCount} SKU${payload.updatedCount === 1 ? "" : "s"} to eBay.`;
              await load();
            } else {
              skipped.push(
                `eBay SKU push: ${[payload.error, payload.details].filter(Boolean).join(" — ")}`,
              );
            }
          } catch {
            skipped.push("eBay SKU push failed.");
          }
        }
      }

      if (savedCount === 0) {
        setSaveError(
          skipped.length
            ? `Nothing saved. ${skipped.join(" · ")}`
            : "Nothing to save.",
        );
        return;
      }

      const recalcNote = payload.ordersRecalcWarning
        ? ` Order recalc note: ${payload.ordersRecalcWarning}`
        : "";

      setSaveMessage(
        `Saved cost/postage for ${savedCount} variation${savedCount === 1 ? "" : "s"}.${ebayNote}${
          skipped.length ? ` Skipped: ${skipped.join(" · ")}` : ""
        }${recalcNote}`,
      );
    } finally {
      setSavingCosts(false);
    }
  }

  async function pushToEbay() {
    if (!listing || (dirtyIndexes.length === 0 && !titleDirty)) {
      return;
    }

    const trimmedTitle = titleDraft.trim();
    if (titleDirty && !trimmedTitle) {
      setSaveError("Title cannot be empty.");
      return;
    }
    if (titleDirty && trimmedTitle.length > 80) {
      setSaveError("Title must be 80 characters or fewer.");
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
            title: titleDirty ? trimmedTitle : undefined,
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
      const parts: string[] = [];
      if (titleDirty) {
        parts.push("title");
      }
      if (payload.updatedCount > (titleDirty ? 1 : 0)) {
        parts.push(
          `${payload.updatedCount - (titleDirty ? 1 : 0)} variation update${payload.updatedCount - (titleDirty ? 1 : 0) === 1 ? "" : "s"}`,
        );
      }

      let trackingNote = "";
      if (titleDirty) {
        try {
          const trackResponse = await fetch(
            `/api/ebay/listings/${encodeURIComponent(listingId)}/title`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: trimmedTitle,
                notes: "Changed from listing editor",
                sku: listing.sku,
                imageUrl: listing.imageUrl,
                applyToEbay: false,
              }),
            },
          );
          const trackPayload = (await trackResponse.json()) as {
            ok: boolean;
            error?: string;
          };
          if (trackPayload.ok) {
            trackingNote =
              " Title tracking started — compare performance in eBay analytics.";
          } else if (
            trackPayload.error?.includes("already the active tracked title")
          ) {
            trackingNote = "";
          } else {
            trackingNote = ` Title pushed, but tracking failed: ${trackPayload.error ?? "unknown error"}.`;
          }
        } catch {
          trackingNote =
            " Title pushed, but could not start analytics tracking.";
        }
      }

      setSaveMessage(
        `Pushed ${parts.join(" and ") || "update"} to eBay (${payload.ack ?? "Success"}).${warningText}${trackingNote}`,
      );
      await load();
    } catch {
      setSaveError("Could not reach the eBay revise endpoint.");
    } finally {
      setSaving(false);
    }
  }

  async function generateSkusForIndexes(indexes: number[]) {
    if (!listing || indexes.length === 0) {
      return;
    }

    const variationSpecifics = indexes
      .map((index) => listing.variations[index]?.specifics.trim())
      .filter((specifics): specifics is string => Boolean(specifics));

    if (!variationSpecifics.length) {
      setSaveError("Could not match selected variations.");
      return;
    }

    setGeneratingSkus(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/ebay/listings/generate-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          prefix: skuPrefix.trim() || "EBAY",
          variationSpecifics,
        }),
      });
      const payload = (await response.json()) as GenerateSkuResponse;

      if (!payload.ok) {
        setSaveError(payload.error);
        return;
      }

      const result = payload.results[0];
      if (!result?.ok) {
        setSaveError(result?.error ?? "Could not generate SKUs.");
        return;
      }

      const skuCount = result.skus?.length ?? 0;
      setSaveMessage(
        `Generated ${skuCount} SKU${skuCount === 1 ? "" : "s"} and pushed to eBay.`,
      );
      await load();
    } catch {
      setSaveError("Could not reach the SKU generation endpoint.");
    } finally {
      setGeneratingSkus(false);
    }
  }

  async function generateSkusForSelected() {
    if (!selectedMissingSkuIndexes.length) {
      setSaveError("Select variations that are missing SKUs.");
      return;
    }

    await generateSkusForIndexes(selectedMissingSkuIndexes);
  }

  async function generateAllMissingSkus() {
    if (!missingSkuIndexes.length) {
      setSaveError("All variations already have SKUs.");
      return;
    }

    await generateSkusForIndexes(missingSkuIndexes);
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
          disabled={saving || savingCosts}
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
          variant="secondary"
          size="sm"
          onClick={() => void generateAllMissingSkus()}
          disabled={
            saving ||
            savingCosts ||
            generatingSkus ||
            missingSkuIndexes.length === 0
          }
        >
          {generatingSkus ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating SKUs…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate SKU
              {missingSkuIndexes.length > 0
                ? ` (${missingSkuIndexes.length})`
                : ""}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void saveCosts()}
          disabled={saving || savingCosts || generatingSkus || dirtyCostIndexes.length === 0}
        >
          {savingCosts ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving costs…
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save cost
              {dirtyCostIndexes.length > 0
                ? ` / postage (${dirtyCostIndexes.length})`
                : " / postage"}
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void pushToEbay()}
          disabled={
            saving ||
            savingCosts ||
            generatingSkus ||
            (dirtyIndexes.length === 0 && !titleDirty)
          }
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Pushing to eBay…
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Push{" "}
              {dirtyIndexes.length + (titleDirty ? 1 : 0) || ""} change
              {dirtyIndexes.length + (titleDirty ? 1 : 0) === 1 ? "" : "s"} to
              eBay
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
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="listing-title-draft"
                  className="text-sm font-medium text-muted-foreground"
                >
                  Listing title
                </label>
                <Input
                  id="listing-title-draft"
                  value={titleDraft}
                  onChange={(event) => {
                    setTitleDraft(event.target.value);
                    setSaveMessage(null);
                    setSaveError(null);
                  }}
                  maxLength={80}
                  className="text-base font-medium"
                  disabled={saving || savingCosts}
                />
                <p className="text-xs text-muted-foreground">
                  {titleDraft.length}/80 characters
                  {titleDirty ? " · unsaved title change" : ""}
                </p>
              </div>
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
                {titleDirty ? (
                  <Badge variant="destructive">Title unsaved</Badge>
                ) : null}
                {dirtyCostIndexes.length > 0 ? (
                  <Badge variant="secondary">
                    {dirtyCostIndexes.length} cost unsaved
                  </Badge>
                ) : null}
                {dirtyIndexes.length > 0 ? (
                  <Badge variant="destructive">
                    {dirtyIndexes.length} eBay unsaved
                  </Badge>
                ) : null}
                {missingSkuIndexes.length > 0 ? (
                  <Badge variant="secondary">
                    {missingSkuIndexes.length} missing SKU
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
              {listing.variationsWarning ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {listing.variationsWarning}
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
        <CardHeader className="border-b border-border/50 bg-muted/20 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>
                {listing.isMultiVariation ? "Variations" : "Listing stock"}
              </CardTitle>
              <CardDescription>
                Enter a SKU plus cost/postage on each row, then{" "}
                <span className="font-medium text-foreground">
                  Save cost / postage
                </span>
                . That also pushes new SKUs to eBay. Rows without a SKU are
                skipped.
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
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/60 p-3 lg:flex-row lg:items-end">
            <div className="w-full max-w-[11rem] space-y-1.5">
              <label
                htmlFor="bulk-postage"
                className="text-sm font-medium leading-none"
              >
                Bulk postage
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  £
                </span>
                <Input
                  id="bulk-postage"
                  value={bulkPostage}
                  onChange={(event) => setBulkPostage(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-7 text-right tabular-nums"
                  disabled={saving || savingCosts || generatingSkus}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={applyBulkPostage}
              disabled={
                saving || savingCosts || generatingSkus || selectedIndexes.size === 0
              }
            >
              Apply to {selectedIndexes.size || 0} selected
            </Button>
            <div className="w-full max-w-[11rem] space-y-1.5">
              <label
                htmlFor="variation-sku-prefix"
                className="text-sm font-medium leading-none"
              >
                SKU prefix
              </label>
              <Input
                id="variation-sku-prefix"
                value={skuPrefix}
                onChange={(event) =>
                  setSkuPrefix(event.target.value.toUpperCase())
                }
                placeholder="EBAY"
                className="font-mono uppercase"
                maxLength={20}
                disabled={saving || savingCosts || generatingSkus}
              />
            </div>
            <Button
              type="button"
              onClick={() => void generateSkusForSelected()}
              disabled={
                saving ||
                savingCosts ||
                generatingSkus ||
                selectedMissingSkuIndexes.length === 0
              }
            >
              {generatingSkus ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate SKU for {selectedMissingSkuIndexes.length || 0}{" "}
                  selected
                </>
              )}
            </Button>
            <p className="text-sm text-muted-foreground lg:pb-2">
              {allRowsSelected
                ? "All variations selected"
                : `${selectedIndexes.size} of ${drafts.length} selected`}
              {missingSkuIndexes.length > 0
                ? ` · ${missingSkuIndexes.length} missing SKU`
                : ""}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1140px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-6">
                    <input
                      type="checkbox"
                      aria-label="Select all variations"
                      checked={allRowsSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = someRowsSelected;
                        }
                      }}
                      onChange={(event) =>
                        toggleSelectAll(event.target.checked)
                      }
                      className="size-4 rounded border-input accent-primary"
                      disabled={saving || savingCosts || generatingSkus}
                    />
                  </TableHead>
                  <TableHead>Variation</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="w-[8.5rem]">Price</TableHead>
                  <TableHead className="w-[8.5rem]">Cost ex-VAT</TableHead>
                  <TableHead className="w-[8.5rem]">Postage</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Est. fees</TableHead>
                  <TableHead className="w-[7.5rem] text-right">Est. profit</TableHead>
                  <TableHead className="pr-6 text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.variations.map((row, index) => {
                  const draft = drafts[index] ?? {
                    sku: "",
                    price: "",
                    unitCost: "",
                    postage: "",
                  };
                  const dirty = dirtyIndexes.includes(index);
                  const selected = selectedIndexes.has(index);
                  const currency = row.currency ?? listing.currency ?? "GBP";
                  const estimate = feeEstimates[index] ?? null;

                  const needsSku = variationRowNeedsSku(
                    draft.sku,
                    row.sku,
                    listing.listingId,
                  );

                  return (
                    <TableRow
                      key={`${row.sku ?? "nosku"}-${index}`}
                      className={
                        dirty
                          ? "bg-amber-500/5"
                          : selected
                            ? "bg-muted/30"
                            : undefined
                      }
                    >
                      <TableCell className="pl-6 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.specifics || `row ${index + 1}`}`}
                          checked={selected}
                          onChange={(event) =>
                            toggleRowSelected(index, event.target.checked)
                          }
                          className="size-4 rounded border-input accent-primary"
                          disabled={saving || savingCosts}
                        />
                      </TableCell>
                      <TableCell className="min-w-0 whitespace-normal align-top">
                        <p className="break-words text-sm font-medium leading-snug">
                          {row.specifics || "—"}
                        </p>
                        {dirty ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Edited
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="min-w-[9rem] align-top whitespace-normal">
                        <Input
                          value={draft.sku}
                          onChange={(event) =>
                            updateDraft(index, { sku: event.target.value })
                          }
                          placeholder="SKU"
                          className={cn(
                            "font-mono text-sm",
                            needsSku && "border-amber-500/50",
                          )}
                          disabled={saving || savingCosts || generatingSkus}
                        />
                        {needsSku ? (
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            Missing SKU
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.price}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { price: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.unitCost}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { unitCost: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <MoneyDraftInput
                          value={draft.postage}
                          currency={currency}
                          disabled={saving || savingCosts}
                          onChange={(value) =>
                            updateDraft(index, { postage: value })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {estimate ? (
                          <div
                            className="space-y-0.5"
                            title={feeEstimateTitle(estimate.ebayFees)}
                          >
                            <p className="tabular-nums font-medium">
                              {formatMoney(estimate.ebayFees.total, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {estimate.ebayFees.adsFee != null
                                ? `incl. promo ${formatMoney(estimate.ebayFees.adsFee, currency)}`
                                : "no promo"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {estimate ? (
                          <div className="space-y-0.5">
                            <p
                              className={cn(
                                "tabular-nums font-semibold",
                                estimate.profit >= 0
                                  ? "text-emerald-700 dark:text-emerald-300"
                                  : "text-destructive",
                              )}
                            >
                              {formatMoney(estimate.profit, currency)}
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {estimate.marginPercent != null
                                ? `${estimate.marginPercent.toFixed(1)}% margin`
                                : "—"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Add cost
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums align-middle font-medium">
                        {formatQty(row.quantityAvailable)}
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
