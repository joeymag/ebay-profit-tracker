import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { ShopifyEmbedNotice } from "@/components/shopify/shopify-embed-notice";

export default function ResetPasswordPage() {
  return (
    <div className="dashboard-canvas flex min-h-svh flex-col bg-background">
      <ShopifyEmbedNotice />
      <div className="flex flex-1 items-center justify-center p-6">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
