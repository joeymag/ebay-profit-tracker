"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SyncResult =
  | {
      ok: true;
      imported: number;
      total: number;
      postageLabelsFound?: number;
      trackingFound?: number;
      syncedAt: string;
    }
  | { ok: false; error: string; hint?: string };

export function SyncOrdersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncOrders() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/shopify/orders/sync", { method: "POST" });
      const data = (await res.json()) as SyncResult;

      if (!data.ok) {
        setError(
          [data.error, data.hint].filter(Boolean).join(" — ") ||
            "Sync failed.",
        );
        return;
      }

      setMessage(
        `Imported ${data.imported} orders · ${data.trackingFound ?? 0} with tracking · ${data.postageLabelsFound ?? 0} with postage.`,
      );
      router.refresh();
    } catch {
      setError("Could not reach the sync endpoint.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={syncOrders} disabled={loading} type="button" size="lg">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Syncing from Shopify…
          </>
        ) : (
          "Sync orders from Shopify"
        )}
      </Button>
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
