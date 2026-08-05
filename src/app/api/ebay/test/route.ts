import { NextResponse } from "next/server";

import { EbayApiError } from "@/lib/ebay/errors";
import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";
import { fetchEbayTransactionsInRange } from "@/lib/ebay/client";
import { hasEbaySigningKey } from "@/lib/ebay/signing-key-store";

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

    let financesOk = false;
    let financesMessage = "Signing key not configured.";
    if (await hasEbaySigningKey()) {
      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 7);
      const transactions = await fetchEbayTransactionsInRange(start, end);
      financesOk = true;
      financesMessage = `Finances API OK · ${transactions.length} transaction(s) in last 7 days.`;
    }

    return NextResponse.json({
      ok: true,
      env: config.env,
      message: "eBay OAuth token is valid.",
      financesOk,
      financesMessage,
      hasSigningKey: await hasEbaySigningKey(),
    });
  } catch (error) {
    if (error instanceof EbayApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          details: error.body?.slice(0, 500),
          hasSigningKey: await hasEbaySigningKey(),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown eBay connection error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
