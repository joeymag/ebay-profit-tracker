import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { ShopifyEmbedNotice } from "@/components/shopify/shopify-embed-notice";

export default function LoginPage() {
  return (
    <div className="dashboard-canvas flex min-h-svh flex-col bg-background">
      <ShopifyEmbedNotice />
      <div className="flex flex-1 items-center justify-center p-6">
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
