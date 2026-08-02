"use client";

import { useState } from "react";
import { Check, Link2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildChildMasterOptions,
  ChildMasterSelector,
} from "@/components/inventory-map/child-master-selector";
import type { InventoryMasterWithChildren } from "@/lib/inventory/master-child-types";

type SingleVariantMappingProps = {
  childSku: string;
  allMasters: InventoryMasterWithChildren[];
  initialMasterSku?: string;
  initialPiecesPerUnit?: number;
  onSaved: (message?: string) => void;
  onError: (message: string | null) => void;
};

export function SingleVariantMapping({
  childSku,
  allMasters,
  initialMasterSku,
  initialPiecesPerUnit,
  onSaved,
  onError,
}: SingleVariantMappingProps) {
  const [expanded, setExpanded] = useState(Boolean(initialMasterSku));
  const [masterSku, setMasterSku] = useState(
    initialMasterSku ?? allMasters[0]?.sku ?? "",
  );
  const [piecesPerUnit, setPiecesPerUnit] = useState(
    initialPiecesPerUnit != null ? String(initialPiecesPerUnit) : "1",
  );
  const [saving, setSaving] = useState(false);

  const options = buildChildMasterOptions({
    inProductMasters: [],
    allMasters,
  });

  async function saveMapping() {
    const master = masterSku.trim();
    const pieces = Number.parseFloat(piecesPerUnit);
    if (!master || !Number.isFinite(pieces) || pieces <= 0) {
      onError("Choose a master SKU and enter pieces per unit.");
      return;
    }

    setSaving(true);
    onError(null);

    try {
      const res = await fetch("/api/inventory/child-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childSku,
          masterSku: master,
          piecesPerUnit: pieces,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        onError(data.error ?? "Could not save child mapping.");
        return;
      }

      onSaved(`Linked ${childSku} to master ${master}.`);
      setExpanded(true);
    } catch {
      onError("Could not save child mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMapping() {
    setSaving(true);
    onError(null);

    try {
      const res = await fetch(
        `/api/inventory/child-mappings?childSku=${encodeURIComponent(childSku)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        onError(data.error ?? "Could not remove child mapping.");
        return;
      }

      onSaved(`Removed mapping for ${childSku}.`);
      setExpanded(false);
      setMasterSku(allMasters[0]?.sku ?? "");
      setPiecesPerUnit("1");
    } catch {
      onError("Could not remove child mapping.");
    } finally {
      setSaving(false);
    }
  }

  if (allMasters.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a master SKU above before linking child listings.
      </p>
    );
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setExpanded(true)}
      >
        <Link2 className="size-4" />
        Link to master SKU
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Map this listing to a master bulk SKU
      </p>
      <ChildMasterSelector
        masterSku={masterSku}
        piecesPerUnit={piecesPerUnit}
        options={options}
        disabled={saving}
        onMasterSkuChange={setMasterSku}
        onPiecesChange={setPiecesPerUnit}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveMapping()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save mapping
        </Button>
        {initialMasterSku ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => void removeMapping()}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => setExpanded(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
