import { NextResponse } from "next/server";

import { getEbayConfig } from "@/lib/ebay/config";
import { sendEbayMessage } from "@/lib/ebay/messages";
import { ebayApiRouteErrorResponse } from "@/lib/ebay/route-response";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";

export async function POST(request: Request) {
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

  let body: {
    messageText?: string;
    conversationId?: string;
    otherPartyUsername?: string;
    emailCopyToSender?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!body.messageText?.trim()) {
    return NextResponse.json(
      { ok: false, error: "messageText is required." },
      { status: 400 },
    );
  }

  if (body.messageText.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Message must be 2000 characters or fewer." },
      { status: 400 },
    );
  }

  try {
    const result = await sendEbayMessage({
      messageText: body.messageText,
      conversationId: body.conversationId,
      otherPartyUsername: body.otherPartyUsername,
      emailCopyToSender: body.emailCopyToSender,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return ebayApiRouteErrorResponse(error, {
      scopeMessage:
        "Messaging access not granted. Reconnect eBay in Settings to add the commerce.message scope.",
      fallbackMessage: "Failed to send message.",
    });
  }
}
