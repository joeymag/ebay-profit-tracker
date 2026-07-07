"use client";

import { ExternalLink } from "lucide-react";

export function ShopifyEmbedNotice() {
  if (typeof window === "undefined" || window.self === window.top) {
    return null;
  }

  const appUrl = window.location.origin;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p>
          Opened inside Shopify admin. If sign-in fails or the page looks wrong,
          open the app in a full browser tab.
        </p>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <ExternalLink className="size-4" />
          Open in new tab
        </a>
      </div>
    </div>
  );
}
