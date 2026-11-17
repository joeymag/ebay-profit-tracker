import { NextResponse } from "next/server";

import { runAmazonBuyBoxMonitor } from "@/lib/amazon/buybox-monitor";
import { getAmazonConfig } from "@/lib/amazon/config";
import { repriceSkusThatLostBuyBox } from "@/lib/amazon/reprice";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";

export const maxDuration = 300;

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Buy Box monitoring — rechecks seeded lost SKUs, then immediately hands
 * Consumer Buy Box losers to Standard auto-reprice (enabled rules + min price).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
      { ok: false, error: "Amazon is not connected." },
      { status: 400 },
    );
  }

  try {
    const result = await runAmazonBuyBoxMonitor();

    if (result.checkedCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No lost-Buy-Box SKUs found. Seed with scripts/debug-post-10p-buybox-check.out.json (or a prior debug-amazon-buybox-check-*.out.json).",
          sourceFile: result.sourceFile,
        },
        { status: 404 },
      );
    }

    const reprice = await repriceSkusThatLostBuyBox(result.lost);

    console.info(
      "[cron/amazon-buybox-check] completed",
      JSON.stringify({
        pulledAt: result.pulledAt,
        sourceFile: result.sourceFile,
        outputFile: result.outputFile,
        checked: result.checkedCount,
        won: result.wonCount,
        lost: result.lostCount,
        failed: result.failedCount,
        reprice: {
          checked: reprice.checked,
          applied: reprice.applied,
          skipped: reprice.skipped,
          failed: reprice.failed,
        },
      }),
    );

    return NextResponse.json({
      ok: true,
      status: "completed",
      message:
        "Buy Box monitor finished; lost SKUs handed to Standard reprice when rules allow. Call every 30–60 minutes with Authorization: Bearer CRON_SECRET.",
      pulledAt: result.pulledAt,
      sourceFile: result.sourceFile,
      outputFile: result.outputFile,
      checkedCount: result.checkedCount,
      wonCount: result.wonCount,
      lostCount: result.lostCount,
      failedCount: result.failedCount,
      won: result.won,
      lost: result.lost,
      failed: result.failed,
      reprice: {
        checked: reprice.checked,
        applied: reprice.applied,
        skipped: reprice.skipped,
        failed: reprice.failed,
        results: reprice.results,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Buy Box monitor failed.";
    console.error("[cron/amazon-buybox-check] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
