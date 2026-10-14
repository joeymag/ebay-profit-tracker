import { NextResponse } from "next/server";

import { loadMarketplacePayments } from "@/lib/accounting/payment-store";
import { TemuApiError } from "@/lib/temu/client";
import { listTemuAccountPayments } from "@/lib/temu/account-payments";
import { getStoredTemuCredentials } from "@/lib/temu/token-store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const result = await loadMarketplacePayments({
      channel: "temu",
      refresh,
      loadFresh: async () => {
        if (!(await getStoredTemuCredentials())) {
          throw new Error("Temu is not connected. Add the seller keys in Settings first.");
        }
        return listTemuAccountPayments(30);
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof TemuApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not load Temu payments.";
    const status = /not connected/i.test(message) ? 400 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
