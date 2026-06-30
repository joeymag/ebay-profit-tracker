import { NextResponse } from "next/server";

import { ShopifyApiError, testShopifyConnection } from "@/lib/shopify/client";
import { getShopifyConfig } from "@/lib/shopify/config";

export async function GET() {
  const config = getShopifyConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Shopify credentials. Add SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET, or SHOPIFY_ADMIN_API_ACCESS_TOKEN (shpat_).",
        hint: config.hasMisplacedSecret
          ? "You put the shpss_ secret in SHOPIFY_ADMIN_API_ACCESS_TOKEN — move it to SHOPIFY_CLIENT_SECRET."
          : undefined,
      },
      { status: 400 },
    );
  }

  try {
    const shop = await testShopifyConnection();
    return NextResponse.json({ ok: true, shop });
  } catch (error) {
    if (error instanceof ShopifyApiError) {
      let hint: string | undefined;
      if (error.status === 401) {
        hint =
          "Token rejected. For Partners apps use SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET and ensure the app is installed on your store.";
      }

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          hint,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error connecting to Shopify";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
