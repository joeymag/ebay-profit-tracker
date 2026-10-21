import { NextResponse } from "next/server";

import {
  loadMarketplacePayments,
  saveMarketplacePayments,
} from "@/lib/accounting/payment-store";
import { TemuApiError } from "@/lib/temu/client";
import {
  listTemuAccountPayments,
  parseTemuPaymentReport,
} from "@/lib/temu/account-payments";
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

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose a Temu payment report CSV or Excel file." }, { status: 400 });
    }
    const fileName = file.name || "temu-payments.csv";
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ ok: false, error: "That file was empty." }, { status: 400 });
    }
    const report = parseTemuPaymentReport(buffer, fileName);
    if (report.payments.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            report.note ||
            "Could not find payment rows in that file. Export the payment report from Temu Seller Center and try again.",
        },
        { status: 400 },
      );
    }
    const payments = report.payments.map((row, index) => ({
      ...row,
      id: `upload-${index}-${row.reference || row.id}`,
    }));
    const syncedAt = await saveMarketplacePayments("temu", payments);
    return NextResponse.json({
      ok: true,
      payments,
      syncedAt,
      warning: null,
      fromCache: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import the Temu payment report.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
