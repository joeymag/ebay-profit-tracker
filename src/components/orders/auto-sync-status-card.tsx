"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type AutoSyncStatus = {
  autoSyncEnabled: boolean;
  schedule: string;
  lastSyncAt: string | null;
};

export function AutoSyncStatusCard() {
  const [status, setStatus] = useState<AutoSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/shopify/orders/auto-sync");
        const data = (await res.json()) as AutoSyncStatus & { ok?: boolean };
        setStatus(data);
      } catch {
        setStatus(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking auto-sync…
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Automatic order import</p>
        <Badge variant={status?.autoSyncEnabled ? "default" : "secondary"}>
          {status?.autoSyncEnabled ? "Enabled on Vercel" : "Not configured"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        New eBay orders appear in Shopify first. When auto-sync is enabled, the
        app pulls new and updated Shopify orders every 15 minutes — no manual
        sync needed. eBay fees sync automatically when new orders are found.
      </p>
      {status?.lastSyncAt ? (
        <p className="text-sm text-muted-foreground">
          Last sync:{" "}
          {new Date(status.lastSyncAt).toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      ) : null}
      {!status?.autoSyncEnabled ? (
        <p className="text-sm text-muted-foreground">
          Add <code className="text-xs">CRON_SECRET</code> in Vercel environment
          variables and redeploy to enable scheduled sync.
        </p>
      ) : null}
    </div>
  );
}
