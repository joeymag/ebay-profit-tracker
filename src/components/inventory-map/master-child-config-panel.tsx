"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Package, Sparkles, Trash2 } from "lucide-react";

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
import type { InventoryMasterWithChildren } from "@/lib/inventory/master-child-types";

type MastersResponse =
  | { ok: true; masters: InventoryMasterWithChildren[] }
  | { ok: false; error: string };

type MasterChildConfigPanelProps = {
  onChanged?: () => void;
};

export function MasterChildConfigPanel({ onChanged }: MasterChildConfigPanelProps) {
  const [masters, setMasters] = useState<InventoryMasterWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [masterSku, setMasterSku] = useState("");
  const [packSize, setPackSize] = useState("1000");
  const [childSku, setChildSku] = useState("");
  const [piecesPerUnit, setPiecesPerUnit] = useState("10");
  const [selectedMasterSku, setSelectedMasterSku] = useState("");

  async function suggestSku(
    setter: (value: string) => void,
    prefix: string,
  ): Promise<void> {
    setError(null);

    try {
      const res = await fetch(
        `/api/shopify/inventory/generate-sku?prefix=${encodeURIComponent(prefix)}`,
      );
      const data = (await res.json()) as
        | { ok: true; sku: string }
        | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setter(data.sku);
    } catch {
      setError("Could not generate SKU.");
    }
  }

  const loadMasters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/inventory/masters");
      const data = (await res.json()) as MastersResponse;
      if (!data.ok) {
        setError(data.error);
        setMasters([]);
        return;
      }
      setMasters(data.masters);
      if (!selectedMasterSku && data.masters.length > 0) {
        setSelectedMasterSku(data.masters[0].sku);
      }
    } catch {
      setError("Could not load master SKUs.");
      setMasters([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMasterSku]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  async function saveMaster() {
    const sku = masterSku.trim();
    const pack = Number.parseInt(packSize, 10);
    if (!sku || !Number.isFinite(pack) || pack <= 0) {
      setError("Enter a master SKU and valid pack size.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/inventory/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          packSize: pack,
          syncFromShopify: true,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }

      setMasterSku("");
      setSelectedMasterSku(data.master.sku);
      await loadMasters();
      onChanged?.();
    } catch {
      setError("Could not save master SKU.");
    } finally {
      setSaving(false);
    }
  }

  async function saveChildMapping() {
    const child = childSku.trim();
    const master = selectedMasterSku.trim();
    const pieces = Number.parseFloat(piecesPerUnit);
    if (!child || !master || !Number.isFinite(pieces) || pieces <= 0) {
      setError("Enter child SKU, master SKU, and pieces per unit.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/inventory/child-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childSku: child,
          masterSku: master,
          piecesPerUnit: pieces,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }

      setChildSku("");
      await loadMasters();
      onChanged?.();
    } catch {
      setError("Could not save child mapping.");
    } finally {
      setSaving(false);
    }
  }

  async function syncMasterFromShopify(sku: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inventory/masters/${encodeURIComponent(sku)}`,
        { method: "PATCH" },
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      await loadMasters();
      onChanged?.();
    } catch {
      setError("Could not sync master stock from Shopify.");
    } finally {
      setSaving(false);
    }
  }

  async function removeChildMapping(child: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inventory/child-mappings?childSku=${encodeURIComponent(child)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) {
        setError(data.error);
        return;
      }
      await loadMasters();
      onChanged?.();
    } catch {
      setError("Could not delete child mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="size-5 text-primary" />
          Master &amp; child SKUs
        </CardTitle>
        <CardDescription>
          A <strong>master SKU</strong> is bulk stock (e.g. a box of 1000 nuts).
          Set pack size, sync from Shopify, then map <strong>child SKUs</strong>{" "}
          sold on listings with how many pieces each unit consumes. Orders deduct
          from the master piece pool on sync.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-sm font-semibold">Add master SKU</p>
            <div className="flex gap-2">
              <Input
                placeholder="Master SKU (bulk pack)"
                value={masterSku}
                onChange={(e) => setMasterSku(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate unique SKU"
                onClick={() => void suggestSku(setMasterSku, "MST")}
              >
                <Sparkles className="size-4" />
              </Button>
            </div>
            <Input
              placeholder="Pack size (pieces per box)"
              inputMode="numeric"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
            />
            <Button type="button" onClick={() => void saveMaster()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save &amp; sync from Shopify
            </Button>
          </div>

          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-sm font-semibold">Map child SKU</p>
            <div className="flex gap-2">
              <Input
                placeholder="Child SKU (sold on Shopify)"
                value={childSku}
                onChange={(e) => setChildSku(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate unique SKU"
                onClick={() => void suggestSku(setChildSku, "CHD")}
              >
                <Sparkles className="size-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedMasterSku}
                onChange={(e) => setSelectedMasterSku(e.target.value)}
              >
                <option value="">Select master SKU</option>
                {masters.map((master) => (
                  <option key={master.sku} value={master.sku}>
                    {master.sku} · {master.packSize.toLocaleString()} pc/box
                  </option>
                ))}
              </select>
              <Input
                placeholder="Pieces per unit sold"
                inputMode="decimal"
                value={piecesPerUnit}
                onChange={(e) => setPiecesPerUnit(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void saveChildMapping()}
              disabled={saving || !selectedMasterSku}
            >
              Save child mapping
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading masters…
          </div>
        ) : masters.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No master SKUs yet. Add one above — e.g. box SKU with pack size 1000.
          </p>
        ) : (
          <div className="space-y-4">
            {masters.map((master) => (
              <div
                key={master.sku}
                className="rounded-xl border border-border/60 bg-muted/15 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">{master.sku}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Pack size: {master.packSize.toLocaleString()} pc · On hand:{" "}
                      <span className="font-medium text-foreground">
                        {Math.floor(master.piecesOnHand).toLocaleString()} pc
                      </span>{" "}
                      ({Math.floor(master.piecesOnHand / master.packSize)} boxes)
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void syncMasterFromShopify(master.sku)}
                  >
                    Sync from Shopify
                  </Button>
                </div>

                {master.children.length ? (
                  <ul className="mt-3 space-y-2">
                    {master.children.map((child) => (
                      <li
                        key={child.childSku}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-mono font-medium">{child.childSku}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            · uses {child.piecesPerUnit} pc per unit sold · sellable{" "}
                            {Math.floor(
                              master.piecesOnHand / child.piecesPerUnit,
                            ).toLocaleString()}{" "}
                            units
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Child</Badge>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={saving}
                            onClick={() => void removeChildMapping(child.childSku)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No child SKUs mapped yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
