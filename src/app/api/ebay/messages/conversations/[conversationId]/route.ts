import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { getEbayConversationNormalized, markEbayConversationRead } from "@/lib/ebay/messages";
import { ebayApiRouteErrorResponse } from "@/lib/ebay/route-response";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
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

  const { conversationId } = await context.params;
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const sellerUsername =
    url.searchParams.get("seller")?.trim() ||
    getEbayConfig().sellerUsername ||
    null;

  try {
    const conversation = await getEbayConversationNormalized(
      conversationId,
      {
        limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 50,
        offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
      },
      sellerUsername,
    );

    return NextResponse.json({ ok: true, conversation, sellerUsername });
  } catch (error) {
    return ebayApiRouteErrorResponse(error, {
      scopeMessage:
        "Messaging access not granted. Reconnect eBay in Settings to add the commerce.message scope.",
      fallbackMessage: "Failed to load conversation.",
    });
  }
}

export async function POST(_request: Request, context: RouteContext) {
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

  const { conversationId } = await context.params;

  try {
    await markEbayConversationRead({ conversationId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return ebayApiRouteErrorResponse(error, {
      scopeMessage:
        "Messaging access not granted. Reconnect eBay in Settings to add the commerce.message scope.",
      fallbackMessage: "Failed to update conversation.",
    });
  }
}
