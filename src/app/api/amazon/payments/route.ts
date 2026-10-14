import { NextResponse } from "next/server";

import { listAmazonAccountPayments } from "@/lib/amazon/account-payments";
import { AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 60;

export async function GET() {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
      { status: 400 },
    );
  }
  if (!(await getStoredAmazonRefreshToken())) {
    return NextResponse.json(
      {
        ok: false,
        error: "Amazon is not connected. Authorize in Settings first.",
      },
      { status: 400 },
    );
  }

  try {
    const payments = await listAmazonAccountPayments(30);
    return NextResponse.json({ ok: true, payments });
  } catch (error) {
    const message =
      error instanceof AmazonApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load Amazon payments.";
    const status = error instanceof AmazonApiError && error.status === 403 ? 403 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
