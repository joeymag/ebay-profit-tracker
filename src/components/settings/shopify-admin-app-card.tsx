import { getAppUrl } from "@/lib/app-url";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ShopifyAdminAppCard() {
  const appUrl = getAppUrl();

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Shopify admin app</CardTitle>
        <CardDescription>
          If the app shows <strong>Example Domain</strong> inside Shopify admin,
          the Partners app URL is still set to the default placeholder. Point it
          at this deployment instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <ol className="list-inside list-decimal space-y-2">
          <li>
            Open{" "}
            <a
              href="https://partners.shopify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              Shopify Partners
            </a>{" "}
            → your app → <strong>Configuration</strong> → <strong>URLs</strong>
          </li>
          <li>
            Set <strong>App URL</strong> to:
            {appUrl ? (
              <code className="mt-1 block break-all rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                {appUrl}
              </code>
            ) : (
              <span className="mt-1 block text-foreground">
                your Vercel URL (add{" "}
                <code className="text-xs">NEXT_PUBLIC_APP_URL</code> to env vars)
              </span>
            )}
          </li>
          <li>
            Add the same URL under <strong>Allowed redirection URL(s)</strong>
          </li>
          <li>
            Save, then in your store go to <strong>Settings → Apps</strong> →
            your app → <strong>Manage app</strong> and confirm it loads this app
          </li>
        </ol>
        <p>
          Optional: turn off <strong>Embed app in Shopify admin</strong> if you
          prefer opening the tracker in its own tab from the Apps menu.
        </p>
      </CardContent>
    </Card>
  );
}
