import { NextResponse } from "next/server";

import { listEbayAccountPayments } from "@/lib/ebay/account-payments";
import { EbayApiError } from "@/lib/ebay/client";
import { getEbayConfig } from "@/lib/ebay/config";
import { EbaySigningKeyMissingError } from "@/lib/ebay/digital-signature";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export const maxDuration = 60;

export async function GET() {
  const config = getEbayConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }
  if (!(await getStoredEbayRefreshToken())) {
    return NextResponse.json(
      {
        ok: false,
        error: "eBay is not connected. Authorize in Settings first.",
      },
      { status: 400 },
    );
  }

  try {
    const payments = await listEbayAccountPayments(30);
    return NextResponse.json({ ok: true, payments });
  } catch (error) {
    if (error instanceof EbaySigningKeyMissingError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const message =
      error instanceof EbayApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load eBay payments.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
