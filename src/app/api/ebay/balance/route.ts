import { NextResponse } from "next/server";

import { EbayApiError, getEbaySellerFundsSummary } from "@/lib/ebay/client";
import { EbaySigningKeyMissingError } from "@/lib/ebay/digital-signature";
import { getEbayConfig } from "@/lib/ebay/config";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

type Funds = {
  amount: number | null;
  currency: string;
};

function readFunds(
  amount: { value?: string; currency?: string } | undefined,
  fallbackCurrency: string,
): Funds {
  const currency = amount?.currency?.trim() || fallbackCurrency;
  if (amount?.value == null || amount.value.trim() === "") {
    return { amount: null, currency };
  }
  const parsed = Number(amount.value);
  return {
    amount: Number.isFinite(parsed) ? parsed : null,
    currency,
  };
}

export async function GET() {
  const config = getEbayConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "eBay is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredEbayRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONNECTED",
        error: "eBay is not connected. Authorize in Settings first.",
      },
      { status: 400 },
    );
  }

  try {
    const summary = await getEbaySellerFundsSummary();
    const currency =
      summary.availableFunds?.currency?.trim() ||
      summary.totalFunds?.currency?.trim() ||
      "GBP";

    return NextResponse.json({
      ok: true,
      currency,
      available: readFunds(summary.availableFunds, currency),
      processing: readFunds(summary.processingFunds, currency),
      onHold: readFunds(summary.fundsOnHold, currency),
      total: readFunds(summary.totalFunds, currency),
    });
  } catch (error) {
    if (error instanceof EbaySigningKeyMissingError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body?.slice(0, 500),
        },
        { status: 502 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Could not load the eBay balance.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
