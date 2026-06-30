"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AutoSyncStatus = {
  autoSyncEnabled: boolean;
  schedule: string;
  lastSyncAt: string | null;
};

export function AutoSyncStatusCard() {
  const [status, setStatus] = useState<AutoSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/shopify/orders/auto-sync");
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = (await res.json()) as AutoSyncStatus & { ok?: boolean };
        setStatus(data);
      } catch {
        setError(true);
        setStatus(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="surface-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Automatic order import</CardTitle>
          {loading ? (
            <Badge variant="secondary">
              <Loader2 className="mr-1 size-3 animate-spin" />
              Checking…
            </Badge>
          ) : (
            <Badge variant={status?.autoSyncEnabled ? "default" : "secondary"}>
              {status?.autoSyncEnabled ? "Enabled" : "Not configured"}
            </Badge>
          )}
        </div>
        <CardDescription>
          New eBay orders appear in Shopify first. When auto-sync is enabled, the
          app pulls new and updated Shopify orders every 15 minutes — no manual
          sync needed. eBay fees sync automatically when new orders are found.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {error ? (
          <p>Could not load auto-sync status. Redeploy the app if this is a new feature.</p>
        ) : null}
        {!loading && status?.lastSyncAt ? (
          <p>
            Last sync:{" "}
            {new Date(status.lastSyncAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        ) : null}
        {!loading && !status?.autoSyncEnabled ? (
          <p>
            Add <code className="text-xs">CRON_SECRET</code> in Vercel environment
            variables (and <code className="text-xs">.env.local</code> for local
            testing), then redeploy to enable scheduled sync every 15 minutes.
          </p>
        ) : null}
        {!loading && status?.autoSyncEnabled ? (
          <p>Schedule: {status.schedule}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
