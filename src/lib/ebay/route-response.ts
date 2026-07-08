import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/errors";

export function ebayApiRouteErrorResponse(
  error: unknown,
  options?: {
    scopeMessage?: string;
    fallbackMessage?: string;
  },
) {
  if (error instanceof EbayApiError) {
    const needsReconnect =
      error.status === 403 &&
      (error.body?.includes("scope") ||
        error.body?.includes("Access denied") ||
        error.body?.includes("Insufficient"));

    return NextResponse.json(
      {
        ok: false,
        error: needsReconnect
          ? (options?.scopeMessage ??
            "eBay permission missing. Reconnect eBay in Settings.")
          : error.message,
        code: needsReconnect ? "SCOPE_REQUIRED" : "EBAY_API_ERROR",
        status: error.status,
        details: error.body?.slice(0, 500),
      },
      { status: needsReconnect ? 403 : 502 },
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : (options?.fallbackMessage ?? "eBay request failed.");

  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
