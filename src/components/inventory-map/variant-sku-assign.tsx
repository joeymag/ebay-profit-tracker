"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VariantSkuAssignProps = {
  variantId: number;
  busy?: boolean;
  compact?: boolean;
  onAssign: (
    variantId: number,
    options?: { refresh?: boolean; sku?: string },
  ) => Promise<string | null>;
};

export function VariantSkuAssign({
  variantId,
  busy = false,
  compact = false,
  onAssign,
}: VariantSkuAssignProps) {
  const [skuInput, setSkuInput] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  const disabled = busy || localBusy;

  async function assignCustomSku() {
    const sku = skuInput.trim();
    if (!sku) {
      return;
    }

    setLocalBusy(true);
    try {
      const assigned = await onAssign(variantId, { sku });
      if (assigned) {
        setSkuInput("");
      }
    } finally {
      setLocalBusy(false);
    }
  }

  async function generateSku() {
    setLocalBusy(true);
    try {
      await onAssign(variantId);
    } finally {
      setLocalBusy(false);
    }
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
              void assignCustomSku();
            }
          }}
          placeholder="Your SKU"
          className="h-8 font-mono text-xs"
          disabled={disabled}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || !skuInput.trim()}
            onClick={() => void assignCustomSku()}
          >
            {localBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Assign
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => void generateSku()}
          >
            {localBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate
          </Button>
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
            void assignCustomSku();
          }
        }}
        placeholder="Enter your SKU"
        className="h-9 font-mono text-sm"
        disabled={disabled}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={disabled || !skuInput.trim()}
          onClick={() => void assignCustomSku()}
        >
          {localBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          Assign SKU
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={disabled}
          onClick={() => void generateSku()}
        >
          {localBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate
        </Button>
      </div>
    </div>
  );
}
