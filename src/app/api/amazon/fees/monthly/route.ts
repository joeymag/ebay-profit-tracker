import { NextResponse } from "next/server";

import { getAmazonConfig } from "@/lib/amazon/config";
import { AmazonApiError } from "@/lib/amazon/client";
import {
  amazonFeesPdfFilename,
  buildAmazonMonthlyFeesPdf,
} from "@/lib/amazon/monthly-fees-pdf";
import {
  defaultFeesMonth,
  fetchAmazonMonthlyFees,
} from "@/lib/amazon/monthly-fees";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 120;

function parsePeriod(request: Request): { year: number; month: number } {
  const { searchParams } = new URL(request.url);
  const defaults = defaultFeesMonth();
  const year = Number.parseInt(
    searchParams.get("year") ?? String(defaults.year),
    10,
  );
  const month = Number.parseInt(
    searchParams.get("month") ?? String(defaults.month),
    10,
  );
  return { year, month };
}

export async function GET(request: Request) {
  const config = getAmazonConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      { ok: false, error: "Amazon is not configured." },
      { status: 400 },
    );
  }

  const refreshToken = await getStoredAmazonRefreshToken();
  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Amazon is not connected. Connect in Settings first.",
        code: "NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  const { year, month } = parsePeriod(request);
  const format = new URL(request.url).searchParams.get("format")?.trim() || "json";

  try {
    const summary = await fetchAmazonMonthlyFees(year, month);

    if (format === "pdf") {
      const pdfBytes = await buildAmazonMonthlyFeesPdf(summary, {
        companyName: process.env.PACK_SHEET_COMPANY_NAME?.trim() || null,
      });
      const filename = amazonFeesPdfFilename(summary);
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body?.slice(0, 400),
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load Amazon monthly fees.",
      },
      { status: 400 },
    );
  }
}
