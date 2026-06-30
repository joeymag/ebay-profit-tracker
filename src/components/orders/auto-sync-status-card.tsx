import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AutoSyncStatus } from "@/lib/shopify/auto-sync-status";

type AutoSyncStatusCardProps = {
  status: AutoSyncStatus;
};

export function AutoSyncStatusCard({ status }: AutoSyncStatusCardProps) {
  return (
    <Card className="surface-card border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Automatic order import</CardTitle>
          <Badge variant={status.autoSyncEnabled ? "default" : "secondary"}>
            {status.autoSyncEnabled ? "Enabled" : "Not configured"}
          </Badge>
        </div>
        <CardDescription>
          New eBay orders appear in Shopify first. When auto-sync is enabled, the
          app pulls new and updated Shopify orders every 15 minutes — no manual
          sync needed. eBay fees sync automatically when new orders are found.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {status.lastSyncAt ? (
          <p>
            Last sync:{" "}
            {new Date(status.lastSyncAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        ) : null}
        {!status.autoSyncEnabled ? (
          <p>
            Add <code className="text-xs">CRON_SECRET</code> in Vercel environment
            variables (and <code className="text-xs">.env.local</code> for local
            testing), then redeploy to enable scheduled sync every 15 minutes.
          </p>
        ) : (
          <p>Schedule: {status.schedule}</p>
        )}
      </CardContent>
    </Card>
  );
}
