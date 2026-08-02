"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VariantSkuAssignProps = {
  variantId: number;
  pendingSku?: string;
  compact?: boolean;
  disabled?: boolean;
  onStage: (variantId: number, sku: string) => void;
  onClearPending: (variantId: number) => void;
  onSuggestSku: () => Promise<string | null>;
};

export function VariantSkuAssign({
  variantId,
  pendingSku,
  compact = false,
  disabled = false,
  onStage,
  onClearPending,
  onSuggestSku,
}: VariantSkuAssignProps) {
  const [skuInput, setSkuInput] = useState("");
  const [editing, setEditing] = useState(!pendingSku);
  const [localBusy, setLocalBusy] = useState(false);

  const busy = disabled || localBusy;

  function stageCustomSku() {
    const sku = skuInput.trim();
    if (!sku) {
      return;
    }

    onStage(variantId, sku);
    setSkuInput("");
    setEditing(false);
  }

  async function stageGeneratedSku() {
    setLocalBusy(true);
    try {
      const sku = await onSuggestSku();
      if (sku) {
        onStage(variantId, sku);
        setEditing(false);
      }
    } finally {
      setLocalBusy(false);
    }
  }

  if (pendingSku && !editing) {
    return (
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        <p className="font-mono text-xs">{pendingSku}</p>
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
              setSkuInput(pendingSku);
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

  if (compact) {
    return (
      <div className="flex min-w-[180px] flex-col gap-2">
        <Input
          value={skuInput}
          onChange={(event) => setSkuInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              stageCustomSku();
            }
          }}
          placeholder="Your SKU"
          className="h-8 font-mono text-xs"
          disabled={busy}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !skuInput.trim()}
            onClick={stageCustomSku}
          >
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void stageGeneratedSku()}
          >
            {localBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate
          </Button>
          {pendingSku ? (
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
            stageCustomSku();
          }
        }}
        placeholder="Enter your SKU"
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
          onClick={stageCustomSku}
        >
          Add SKU
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy}
          onClick={() => void stageGeneratedSku()}
        >
          {localBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate
        </Button>
        {pendingSku ? (
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
