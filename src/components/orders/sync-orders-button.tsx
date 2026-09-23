"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AutoSyncStatus } from "@/lib/shopify/auto-sync-status";

type SyncResult =
  | {
      ok: true;
      mode?: string;
      status?: string;
      imported: number;
      total: number;
      postageLabelsFound?: number;
      trackingFound?: number;
      syncedAt: string | null;
      hint?: string;
    }
  | { ok: false; error: string; hint?: string };

export function SyncOrdersButton({
  autoSyncStatus,
}: {
  autoSyncStatus?: AutoSyncStatus;
}) {
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

      let data: SyncResult;
      try {
        data = (await res.json()) as SyncResult;
      } catch {
        setError(
          res.status === 504 || res.status === 408
            ? "Sync timed out on the server. Try Quick sync again, or wait for auto-sync."
            : `Sync failed (HTTP ${res.status}). Try again after redeploy.`,
        );
        return;
      }

      if (!data.ok) {
        setError(
          [data.error, data.hint].filter(Boolean).join(" — ") ||
            "Sync failed.",
        );
        return;
      }

      setMessage(
        data.status === "started"
          ? data.hint ||
              "Full sync started in the background. Refresh in a few minutes."
          : mode === "quick"
            ? `Updated ${data.imported} order${data.imported === 1 ? "" : "s"} (quick sync · only recent Shopify changes${
                data.postageLabelsFound
                  ? ` · ${data.postageLabelsFound} with postage`
                  : ""
              }).`
            : `Imported ${data.imported} orders · ${data.trackingFound ?? 0} with tracking · ${data.postageLabelsFound ?? 0} with postage.`,
      );
      if (data.hint) {
        setMessage((prev) => (prev ? `${prev} ${data.hint}` : data.hint ?? null));
      }
      router.refresh();
    } catch {
      setError(
        mode === "full"
          ? "Full sync timed out — try Quick sync, or wait for auto-sync to pick up postage labels."
          : "Sync timed out or could not reach the server. Try Quick sync again after redeploy, or rely on auto-sync for postage.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {autoSyncStatus ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Automatic order import</p>
            <Badge variant={autoSyncStatus.autoSyncEnabled ? "default" : "secondary"}>
              {autoSyncStatus.autoSyncEnabled ? "Ready" : "Set up CRON_SECRET"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {autoSyncStatus.autoSyncEnabled
              ? autoSyncStatus.schedule
              : "Add CRON_SECRET in Vercel, then use cron-job.org to call /api/cron/sync-orders every 15 min."}
          </p>
        </div>
      ) : null}
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
        Quick sync only pulls orders changed since the last sync (fast). Full
        sync runs in the background and refreshes labels &amp; images — refresh
        the page after a few minutes. Auto-import also runs about every 15
        minutes when cron is set up.
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
