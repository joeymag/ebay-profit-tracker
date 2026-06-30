"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SyncResult =
  | {
      ok: true;
      mode?: string;
      imported: number;
      total: number;
      postageLabelsFound?: number;
      trackingFound?: number;
      syncedAt: string;
      hint?: string;
    }
  | { ok: false; error: string; hint?: string };

export function SyncOrdersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncOrders(mode: "quick" | "full") {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`/api/shopify/orders/sync?mode=${mode}`, {
        method: "POST",
      });
      const data = (await res.json()) as SyncResult;

      if (!data.ok) {
        setError(
          [data.error, data.hint].filter(Boolean).join(" — ") ||
            "Sync failed.",
        );
        return;
      }

      setMessage(
        mode === "quick"
          ? `Updated ${data.imported} orders (quick sync · eBay IDs & order fields).`
          : `Imported ${data.imported} orders · ${data.trackingFound ?? 0} with tracking · ${data.postageLabelsFound ?? 0} with postage.`,
      );
      if (data.hint) {
        setMessage((prev) => (prev ? `${prev} ${data.hint}` : data.hint ?? null));
      }
      router.refresh();
    } catch {
      setError(
        mode === "full"
          ? "Full sync timed out — try Quick sync on Vercel, or run full sync locally."
          : "Could not reach the sync endpoint. Check Vercel env vars and redeploy.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => syncOrders("quick")}
          disabled={loading}
          type="button"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" />
              Syncing from Shopify…
            </>
          ) : (
            "Sync orders (quick)"
          )}
        </Button>
        <Button
          onClick={() => syncOrders("full")}
          disabled={loading}
          type="button"
          size="lg"
          variant="outline"
        >
          Full sync (labels & images)
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Quick sync updates existing orders (eBay order IDs, tags, addresses) without
        duplicates. Full sync also fetches postage labels and product images — use
        locally; it can take several minutes.
      </p>
      {message ? (
        <Badge variant="secondary" className="font-normal">
          {message}
        </Badge>
      ) : null}
      {error ? (
        <p className="text-base text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
