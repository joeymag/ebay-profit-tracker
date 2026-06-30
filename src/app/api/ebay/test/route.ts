import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/client";
import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";

export async function GET() {
  const config = getEbayConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing eBay credentials. Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME to .env.local.",
      },
      { status: 400 },
    );
  }

  try {
    await getEbayAccessToken();
    return NextResponse.json({
      ok: true,
      env: config.env,
      message: "eBay OAuth token is valid.",
    });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown eBay connection error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
