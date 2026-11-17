import { after, NextResponse } from "next/server";

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
 * Buy Box monitoring — rechecks seeded lost SKUs, then hands Consumer Buy Box
 * losers to Standard auto-reprice in the background (enabled rules + min price).
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
            "No Amazon listings found to check. Sync amazon_listings (or warm the listings cache), then retry.",
          sourceFile: result.sourceFile,
        },
        { status: 404 },
      );
    }

    const lostForHandoff = result.lost;

    after(async () => {
      try {
        const reprice = await repriceSkusThatLostBuyBox(lostForHandoff);
        console.info(
          "[cron/amazon-buybox-check] reprice handoff completed",
          JSON.stringify({
            lost: lostForHandoff.length,
            checked: reprice.checked,
            applied: reprice.applied,
            skipped: reprice.skipped,
            failed: reprice.failed,
          }),
        );
        for (const row of reprice.results) {
          if (row.status === "applied" || row.status === "failed") {
            console.info(
              "[cron/amazon-buybox-check] reprice",
              row.status,
              row.sku,
              row.reason,
              row.fromPrice,
              "->",
              row.toPrice,
            );
          }
        }
      } catch (error) {
        console.error(
          "[cron/amazon-buybox-check] reprice handoff failed:",
          error instanceof Error ? error.message : error,
        );
      }
    });

    console.info(
      "[cron/amazon-buybox-check] monitor completed; reprice started",
      JSON.stringify({
        pulledAt: result.pulledAt,
        sourceFile: result.sourceFile,
        outputFile: result.outputFile,
        checked: result.checkedCount,
        won: result.wonCount,
        lost: result.lostCount,
        failed: result.failedCount,
      }),
    );

    return NextResponse.json({
      ok: true,
      status: "started",
      message:
        "Buy Box monitor finished; Standard reprice of lost SKUs started in background. Call every 30–60 minutes with Authorization: Bearer CRON_SECRET.",
      pulledAt: result.pulledAt,
      sourceFile: result.sourceFile,
      outputFile: result.outputFile,
      checkedCount: result.checkedCount,
      wonCount: result.wonCount,
      lostCount: result.lostCount,
      failedCount: result.failedCount,
      won: result.won.map(({ competitive: _c, ...rest }) => rest),
      lost: result.lost.map(({ competitive: _c, ...rest }) => rest),
      failed: result.failed.map(({ competitive: _c, ...rest }) => rest),
      reprice: {
        status: "started",
        lostQueued: lostForHandoff.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Buy Box monitor failed.";
    console.error("[cron/amazon-buybox-check] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
