import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { listEbayConversationsNormalized } from "@/lib/ebay/messages";
import type { EbayConversationStatus } from "@/lib/ebay/message-types";
import { ebayApiRouteErrorResponse } from "@/lib/ebay/route-response";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function GET(request: Request) {
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
        error: "eBay is not connected. Authorize in Settings first.",
        code: "NOT_CONNECTED",
      },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const conversationStatus = url.searchParams.get(
    "conversation_status",
  ) as EbayConversationStatus | null;
  const otherPartyUsername = url.searchParams.get("other_party_username");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  try {
    const data = await listEbayConversationsNormalized({
      conversationStatus: conversationStatus ?? undefined,
      otherPartyUsername: otherPartyUsername ?? undefined,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 50,
      offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return ebayApiRouteErrorResponse(error, {
      scopeMessage:
        "Messaging access not granted. Reconnect eBay in Settings to add the commerce.message scope.",
      fallbackMessage: "Failed to load eBay conversations.",
    });
  }
}
