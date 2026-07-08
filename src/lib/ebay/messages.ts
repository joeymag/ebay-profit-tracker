import { ebayMessageFetch } from "@/lib/ebay/message-client";
import type {
  EbayConversationDetailResponse,
  EbayConversationStatus,
  EbayConversationType,
  EbayConversationsResponse,
  EbaySendMessageResponse,
} from "@/lib/ebay/message-types";

export type ListConversationsOptions = {
  conversationType?: EbayConversationType;
  conversationStatus?: EbayConversationStatus;
  otherPartyUsername?: string;
  limit?: number;
  offset?: number;
};

export type GetConversationOptions = {
  conversationType?: EbayConversationType;
  limit?: number;
  offset?: number;
};

export async function listEbayConversations(
  options: ListConversationsOptions = {},
): Promise<EbayConversationsResponse> {
  const params = new URLSearchParams();
  params.set(
    "conversation_type",
    options.conversationType ?? "FROM_MEMBERS",
  );

  if (options.conversationStatus) {
    params.set("conversation_status", options.conversationStatus);
  }

  if (options.otherPartyUsername?.trim()) {
    params.set("other_party_username", options.otherPartyUsername.trim());
  }

  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));

  return ebayMessageFetch<EbayConversationsResponse>(
    `/conversation?${params.toString()}`,
  );
}

export async function getEbayConversation(
  conversationId: string,
  options: GetConversationOptions = {},
): Promise<EbayConversationDetailResponse> {
  const params = new URLSearchParams();
  params.set(
    "conversation_type",
    options.conversationType ?? "FROM_MEMBERS",
  );
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));

  return ebayMessageFetch<EbayConversationDetailResponse>(
    `/conversation/${encodeURIComponent(conversationId)}?${params.toString()}`,
  );
}

export async function sendEbayMessage(input: {
  messageText: string;
  conversationId?: string;
  otherPartyUsername?: string;
  emailCopyToSender?: boolean;
}): Promise<EbaySendMessageResponse> {
  const messageText = input.messageText.trim();
  if (!messageText) {
    throw new Error("Message text is required.");
  }

  if (!input.conversationId && !input.otherPartyUsername?.trim()) {
    throw new Error("conversationId or otherPartyUsername is required.");
  }

  const body: Record<string, unknown> = {
    messageText,
    emailCopyToSender: input.emailCopyToSender ?? false,
  };

  if (input.conversationId) {
    body.conversationId = input.conversationId;
  } else {
    body.otherPartyUsername = input.otherPartyUsername!.trim();
  }

  return ebayMessageFetch<EbaySendMessageResponse>("/send_message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function markEbayConversationRead(input: {
  conversationId: string;
  conversationType?: EbayConversationType;
  read?: boolean;
}): Promise<void> {
  await ebayMessageFetch<Record<string, never>>("/update_conversation", {
    method: "POST",
    body: JSON.stringify({
      conversationId: input.conversationId,
      conversationType: input.conversationType ?? "FROM_MEMBERS",
      read: input.read ?? true,
    }),
  });
}
