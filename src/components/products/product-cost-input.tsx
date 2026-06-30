"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ProductCostInputProps = {
  sku: string;
  initialCost: number | null;
};

export function ProductCostInput({ sku, initialCost }: ProductCostInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(
    initialCost != null ? String(initialCost) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCost() {
    const trimmed = value.trim();
    const unitCost = trimmed === "" ? null : Number.parseFloat(trimmed);

    if (trimmed !== "" && (!Number.isFinite(unitCost) || unitCost! < 0)) {
      setError("Enter a valid cost");
      return;
    }

    if (unitCost === initialCost || (unitCost == null && initialCost == null)) {
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitCost }),
      });
      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Save failed");
        return;
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-28">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
          £
        </span>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
            setError(null);
          }}
          onBlur={saveCost}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className={cn("pl-7 text-right tabular-nums", error && "border-destructive")}
          disabled={saving}
        />
      </div>
      {saving ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : saved ? (
        <Check className="size-4 text-primary" />
      ) : null}
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
