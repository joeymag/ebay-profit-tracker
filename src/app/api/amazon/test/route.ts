import { NextResponse } from "next/server";

import { getAmazonAccessToken } from "@/lib/amazon/auth";
import {
  AmazonApiError,
  fetchAmazonMarketplaceParticipations,
  fetchAmazonSandboxOrdersProbe,
} from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";

export async function GET() {
  const config = getAmazonConfig();

  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing Amazon credentials. Add AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET to .env.local.",
      },
      { status: 400 },
    );
  }

  try {
    await getAmazonAccessToken();

    try {
      const participations = await fetchAmazonMarketplaceParticipations();
      const count = participations.payload?.length ?? 0;
      const names =
        participations.payload
          ?.map((row) => row.marketplace?.name)
          .filter(Boolean)
          .slice(0, 5)
          .join(", ") || "none listed";

      return NextResponse.json({
        ok: true,
        env: config.env,
        region: config.region,
        message: `Amazon SP-API token is valid · ${count} marketplace participation(s): ${names}.`,
      });
    } catch (sellersError) {
      // Sandbox apps often exercise Orders with the Step 5 static case instead.
      if (config.isSandbox) {
        const orders = await fetchAmazonSandboxOrdersProbe();
        const orderCount = orders.payload?.Orders?.length ?? 0;
        return NextResponse.json({
          ok: true,
          env: config.env,
          region: config.region,
          message: `Amazon LWA token is valid · sandbox Orders probe returned ${orderCount} order(s).`,
          sellersError:
            sellersError instanceof Error
              ? sellersError.message
              : "Sellers API unavailable in this sandbox app",
        });
      }
      throw sellersError;
    }
  } catch (error) {
    if (error instanceof AmazonApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          status: error.status,
          details: error.body.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown Amazon connection error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
