import { Suspense } from "react";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DatabaseStatus } from "@/components/settings/database-status";
import { EbayConnectionCard } from "@/components/settings/ebay-connection-card";
import { EbayFeesSyncButton } from "@/components/settings/ebay-fees-sync-button";
import { ShopifyConnectionTest } from "@/components/settings/shopify-connection-test";
import { getStorageBackend } from "@/lib/orders/store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  const storageBackend = getStorageBackend();

  return (
    <>
      <DashboardHeader
        title="Settings"
        description="Shopify, eBay, and database"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>
              Supabase stores orders so the app does not re-fetch everything
              from Shopify on each page load.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DatabaseStatus backend={storageBackend} />
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>Shopify Admin API</CardTitle>
            <CardDescription>
              Use your Partners app <strong>Client ID</strong> and{" "}
              <strong>Secret</strong> (<code className="text-xs">shpss_</code>
              ) in <code className="text-xs">.env.local</code>. The secret is
              not the access token — the app exchanges it automatically for a
              short-lived API token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-base text-muted-foreground">
            <p>
              Environment variables (see{" "}
              <code className="text-xs">.env.example</code>):
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <code className="text-xs">SHOPIFY_STORE_DOMAIN</code>
              </li>
              <li>
                <code className="text-xs">SHOPIFY_CLIENT_ID</code> — from Dev
                Dashboard → Settings
              </li>
              <li>
                <code className="text-xs">SHOPIFY_CLIENT_SECRET</code> — the{" "}
                <code className="text-xs">shpss_</code> value (not{" "}
                <code className="text-xs">SHOPIFY_ADMIN_API_ACCESS_TOKEN</code>)
              </li>
            </ul>
            <p className="pt-2">
              Required <strong>Admin API</strong> scope:{" "}
              <code className="text-xs">read_orders</code> (optional:{" "}
              <code className="text-xs">read_all_orders</code>).{" "}
              <code className="text-xs">customer_read_orders</code> is a
              different API and will not work for order sync.
            </p>
            <ShopifyConnectionTest />
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle>eBay Finances API</CardTitle>
            <CardDescription>
              Connect your eBay seller account to pull actual fees from eBay
              (separate from Shopify). Add credentials to{" "}
              <code className="text-xs">.env.local</code> / Vercel, then
              authorize once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
              <div className="space-y-6">
                <EbayConnectionCard />
                <EbayFeesSyncButton />
              </div>
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
