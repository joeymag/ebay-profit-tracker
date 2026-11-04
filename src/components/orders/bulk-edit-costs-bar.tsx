"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseMoneyInput } from "@/lib/orders/parse-cost-inputs";
import type { StoredOrder } from "@/lib/orders/types";

type BulkEditCostsBarProps = {
  selectedOrders: StoredOrder[];
  onClearSelection: () => void;
};

export function BulkEditCostsBar({
  selectedOrders,
  onClearSelection,
}: BulkEditCostsBarProps) {
  const router = useRouter();
  const [productCost, setProductCost] = useState("");
  const [postageCost, setPostageCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const busy = saving || deleting;

  async function applyBulkEdit() {
    const product = parseMoneyInput(productCost);
    const postage = parseMoneyInput(postageCost);

    const hasProduct = productCost.trim().length > 0;
    const hasPostage = postageCost.trim().length > 0;

    if (!hasProduct && !hasPostage) {
      setError("Enter at least one value to apply (leave fields blank to skip).");
      return;
    }

    if (hasProduct && product == null) {
      setError("Enter a valid product cost.");
      return;
    }

    if (hasPostage && postage == null) {
      setError("Enter a valid postage cost.");
      return;
    }

    const body: Record<string, unknown> = {
      shopifyIds: selectedOrders.map((o) => o.shopifyId),
    };

    if (hasProduct && product != null) {
      body.productCost = product;
    }
    if (hasPostage && postage != null) {
      body.shippingLabelCost = postage;
    }

    setSaving(true);
    setError(null);
    setResultMessage(null);

    try {
      const res = await fetch("/api/orders/bulk-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Bulk update failed");
        return;
      }

      const parts = [`Updated ${data.updatedCount} order(s)`];
      if (data.skipped?.length) {
        parts.push(`${data.skipped.length} skipped`);
      }
      if (data.failed?.length) {
        parts.push(`${data.failed.length} failed`);
      }

      setResultMessage(parts.join(" · "));
      onClearSelection();
      setProductCost("");
      setPostageCost("");
      router.refresh();
    } catch {
      setError("Could not save bulk changes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    const count = selectedOrders.length;
    const preview = selectedOrders
      .slice(0, 5)
      .map((order) => order.orderNumber)
      .join(", ");
    const more = count > 5 ? ` and ${count - 5} more` : "";
    const confirmed = window.confirm(
      `Remove ${count} order${count === 1 ? "" : "s"} from the profit tracker?\n\n${preview}${more}\n\nThey will not come back on the next sync. This does not cancel them in Shopify.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setResultMessage(null);

    try {
      const res = await fetch("/api/orders/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyIds: selectedOrders.map((order) => order.shopifyId),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        deletedCount?: number;
        failed?: Array<{ shopifyId: number; error: string }>;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Bulk delete failed");
        return;
      }

      const parts = [`Removed ${data.deletedCount ?? 0} order(s)`];
      if (data.failed?.length) {
        parts.push(`${data.failed.length} failed`);
      }
      setResultMessage(parts.join(" · "));
      onClearSelection();
      router.refresh();
    } catch {
      setError("Could not delete the selected orders");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="sticky bottom-0 z-10 border-t border-violet-500/30 bg-violet-500/10 px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">
              Bulk edit · {selectedOrders.length} order
              {selectedOrders.length === 1 ? "" : "s"} selected
            </p>
            <p className="text-sm text-muted-foreground">
              Edit costs, or remove duplicate / unwanted orders from the tracker.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onClearSelection}
            disabled={busy}
          >
            <X className="size-4" />
            Clear selection
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Product cost (ex-VAT)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                £
              </span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Skip"
                value={productCost}
                onChange={(e) => {
                  setProductCost(e.target.value);
                  setError(null);
                }}
                className="bg-background pl-8 text-right tabular-nums"
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Postage cost
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                £
              </span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Skip"
                value={postageCost}
                onChange={(e) => {
                  setPostageCost(e.target.value);
                  setError(null);
                }}
                className="bg-background pl-8 text-right tabular-nums"
                disabled={busy}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={applyBulkEdit} disabled={busy}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Applying…
              </>
            ) : (
              `Apply to ${selectedOrders.length} order(s)`
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="gap-1.5"
            onClick={deleteSelected}
            disabled={busy}
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Removing…
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Remove from tracker
              </>
            )}
          </Button>
          {resultMessage ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-primary">
              <Check className="size-4" />
              {resultMessage}
            </span>
          ) : null}
          {error ? (
            <span className="text-sm text-destructive">{error}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
