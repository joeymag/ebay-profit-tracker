import type { NextRequest } from "next/server";

export function isShopifyEmbeddedRequest(
  request: Pick<NextRequest, "nextUrl" | "headers">,
): boolean {
  if (request.nextUrl.searchParams.get("embedded") === "1") {
    return true;
  }

  if (request.headers.get("sec-fetch-dest") === "iframe") {
    return true;
  }

  const referer = request.headers.get("referer") ?? "";
  return (
    referer.includes(".myshopify.com") || referer.includes("admin.shopify.com")
  );
}

export function supabaseCookieOptionsForEmbed(embedded: boolean) {
  if (!embedded) {
    return undefined;
  }

  return {
    sameSite: "none" as const,
    secure: true,
  };
}
