"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PendingVariantIdentifiers = {
  sku?: string;
  barcode?: string;
};

type VariantSkuAssignProps = {
  variantId: number;
  mode?: "sku" | "barcode";
  existingSku?: string | null;
  pending?: PendingVariantIdentifiers;
  compact?: boolean;
  disabled?: boolean;
  onStage: (variantId: number, input: PendingVariantIdentifiers) => void;
  onClearPending: (variantId: number) => void;
  onSuggestSku?: () => Promise<string | null>;
};

export function VariantSkuAssign({
  variantId,
  mode = "sku",
  existingSku,
  pending,
  compact = false,
  disabled = false,
  onStage,
  onClearPending,
  onSuggestSku,
}: VariantSkuAssignProps) {
  const [skuInput, setSkuInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [editing, setEditing] = useState(!pending);
  const [localBusy, setLocalBusy] = useState(false);

  const busy = disabled || localBusy;
  const isBarcodeOnly = mode === "barcode";

  useEffect(() => {
    if (pending?.sku && !skuInput) {
      setSkuInput(pending.sku);
    }
    if (pending?.barcode && !barcodeInput) {
      setBarcodeInput(pending.barcode);
    }
  }, [pending, skuInput, barcodeInput]);

  function stageValues() {
    if (isBarcodeOnly) {
      const barcode = barcodeInput.trim();
      if (!barcode) {
        return;
      }

      onStage(variantId, { barcode });
      setBarcodeInput("");
      setEditing(false);
      return;
    }

    const sku = skuInput.trim();
    if (!sku) {
      return;
    }

    const barcode = barcodeInput.trim() || sku;
    onStage(variantId, { sku, barcode });
    setSkuInput("");
    setBarcodeInput("");
    setEditing(false);
  }

  async function stageGeneratedSku() {
    if (!onSuggestSku) {
      return;
    }

    setLocalBusy(true);
    try {
      const sku = await onSuggestSku();
      if (sku) {
        onStage(variantId, { sku, barcode: sku });
        setSkuInput("");
        setBarcodeInput("");
        setEditing(false);
      }
    } finally {
      setLocalBusy(false);
    }
  }

  if (pending && !editing) {
    return (
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {pending.sku ? <p className="font-mono text-xs">{pending.sku}</p> : null}
        {pending.barcode ? (
          <p className="font-mono text-xs text-muted-foreground">{pending.barcode}</p>
        ) : pending.sku ? (
          <p className="text-xs text-muted-foreground">Barcode: same as SKU</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-amber-500/40 text-amber-700">
            Pending save
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => {
              if (pending.sku) {
                setSkuInput(pending.sku);
              }
              if (pending.barcode) {
                setBarcodeInput(pending.barcode);
              }
              setEditing(true);
            }}
          >
            Change
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => {
              onClearPending(variantId);
              setSkuInput("");
              setBarcodeInput("");
              setEditing(true);
            }}
          >
            <X className="size-3" />
            Remove
          </Button>
        </div>
      </div>
    );
  }

  if (isBarcodeOnly) {
    return (
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {existingSku ? (
          <p className="font-mono text-[11px] text-muted-foreground">SKU: {existingSku}</p>
        ) : null}
        <Input
          value={barcodeInput}
          onChange={(event) => setBarcodeInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              stageValues();
            }
          }}
          placeholder="Barcode / GTIN"
          className={compact ? "h-8 font-mono text-xs" : "h-9 font-mono text-sm"}
          disabled={busy}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !barcodeInput.trim()}
          onClick={stageValues}
        >
          Add barcode
        </Button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex min-w-[180px] flex-col gap-2">
        <Input
          value={skuInput}
          onChange={(event) => setSkuInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              stageValues();
            }
          }}
          placeholder="Your SKU"
          className="h-8 font-mono text-xs"
          disabled={busy}
        />
        <Input
          value={barcodeInput}
          onChange={(event) => setBarcodeInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              stageValues();
            }
          }}
          placeholder="Barcode (defaults to SKU)"
          className="h-8 font-mono text-xs"
          disabled={busy}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !skuInput.trim()}
            onClick={stageValues}
          >
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || !onSuggestSku}
            onClick={() => void stageGeneratedSku()}
          >
            {localBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate
          </Button>
          {pending ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={skuInput}
        onChange={(event) => setSkuInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            stageValues();
          }
        }}
        placeholder="Enter your SKU"
        className="h-9 font-mono text-sm"
        disabled={busy}
      />
      <Input
        value={barcodeInput}
        onChange={(event) => setBarcodeInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            stageValues();
          }
        }}
        placeholder="Barcode (defaults to SKU)"
        className="h-9 font-mono text-sm"
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy || !skuInput.trim()}
          onClick={stageValues}
        >
          Add SKU
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy || !onSuggestSku}
          onClick={() => void stageGeneratedSku()}
        >
          {localBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate
        </Button>
        {pending ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
