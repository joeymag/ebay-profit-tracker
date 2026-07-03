import { Suspense } from "react";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DatabaseStatus } from "@/components/settings/database-status";
import { AutoSyncStatusCard } from "@/components/orders/auto-sync-status-card";
import { EbayConnectionCard } from "@/components/settings/ebay-connection-card";
import { EbayFeesSyncButton } from "@/components/settings/ebay-fees-sync-button";
import { EbaySigningKeySetup } from "@/components/settings/ebay-signing-key-setup";
import { ShopifyConnectionTest } from "@/components/settings/shopify-connection-test";
import { getStorageBackend } from "@/lib/orders/store";
import { getAutoSyncStatus } from "@/lib/shopify/auto-sync-status";
import { getAuthUser } from "@/lib/supabase/server-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SettingsPage() {
  const storageBackend = getStorageBackend();
  const autoSyncStatus = await getAutoSyncStatus();
  const user = await getAuthUser();

  return (
    <>
      <DashboardHeader
        title="Settings"
        description="Shopify, eBay, and database"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle>App sign-in</CardTitle>
            <CardDescription>
              The dashboard is protected with Supabase Auth. Create users in your
              Supabase project under{" "}
              <strong>Authentication → Users → Add user</strong> (email +
              password). Enable the Email provider under Authentication →
              Providers. Add redirect URL{" "}
              <code className="text-xs">https://your-domain/auth/callback</code>{" "}
              (and{" "}
              <code className="text-xs">http://localhost:3000/auth/callback</code>{" "}
              for local dev).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {user?.email ? (
              <p>
                Signed in as{" "}
                <span className="font-medium text-foreground">{user.email}</span>
              </p>
            ) : (
              <p>Not signed in.</p>
            )}
          </CardContent>
        </Card>

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
              Required <strong>Admin API</strong> scopes:{" "}
              <code className="text-xs">read_orders</code> (optional:{" "}
              <code className="text-xs">read_all_orders</code>). For stock
              control also add{" "}
              <code className="text-xs">read_inventory</code> and{" "}
              <code className="text-xs">write_inventory</code>, then release
              the app version and reinstall on your store.{" "}
              <code className="text-xs">customer_read_orders</code> is a
              different API and will not work for order sync.
            </p>
            <ShopifyConnectionTest />
          </CardContent>
        </Card>

        <AutoSyncStatusCard status={autoSyncStatus} />

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
                <EbaySigningKeySetup />
                <EbayFeesSyncButton />
              </div>
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
