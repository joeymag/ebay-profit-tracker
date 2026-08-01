import { Suspense } from "react";

import { AuthSessionFromUrl } from "@/components/auth/auth-session-from-url";
import { ShopifyEmbedNotice } from "@/components/shopify/shopify-embed-notice";

export default function AuthCompletePage() {
  return (
    <div className="dashboard-canvas flex min-h-svh flex-col bg-background">
      <ShopifyEmbedNotice />
      <Suspense fallback={<p className="p-6 text-muted-foreground">Loading…</p>}>
        <AuthSessionFromUrl />
      </Suspense>
    </div>
  );
}
