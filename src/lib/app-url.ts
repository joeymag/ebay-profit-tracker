/** Public HTTPS URL for this deployment (Shopify Partners App URL, OAuth redirects, etc.). */
export function getAppUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  // VERCEL_URL changes on every deploy. QuickBooks requires the redirect
  // URI to stay exactly the same, so production uses the stable domain.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production && process.env.VERCEL_ENV === "production") {
    return `https://${production.replace(/^https?:\/\//, "")}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "")}`;
  }

  return null;
}
