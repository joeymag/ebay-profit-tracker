export type EbayConversationType = "FROM_MEMBERS" | "FROM_EBAY";

export type EbayConversationStatus =
  | "ACTIVE"
  | "ARCHIVED"
  | "DELETED"
  | "READ"
  | "UNREAD";

export type EbayMessageParty = {
  username?: string;
};

export type EbayMessagePreview = {
  messageText?: string;
  messageId?: string;
  creationDate?: string;
  senderUsername?: string;
  read?: boolean;
};

export type EbayConversationSummary = {
  conversationId?: string;
  conversationType?: EbayConversationType;
  conversationStatus?: EbayConversationStatus | string;
  read?: boolean;
  otherPartyUsername?: string;
  otherParty?: EbayMessageParty;
  latestMessage?: EbayMessagePreview;
  lastMessage?: EbayMessagePreview;
  messagePreview?: EbayMessagePreview;
  reference?: {
    referenceType?: string;
    referenceId?: string;
  };
};

export type EbayConversationMessage = {
  messageId?: string;
  messageText?: string;
  creationDate?: string;
  senderUsername?: string;
  recipientUsername?: string;
  read?: boolean;
  messageMedia?: Array<{ mediaType?: string; mediaUrl?: string }>;
};

export type EbayConversationsResponse = {
  conversations?: EbayConversationSummary[];
  total?: number;
  href?: string;
  next?: string;
  limit?: number;
  offset?: number;
};

export type EbayConversationDetailResponse = {
  conversationId?: string;
  conversationType?: EbayConversationType;
  messages?: EbayConversationMessage[];
  total?: number;
  limit?: number;
  offset?: number;
};

export type EbaySendMessageResponse = {
  messageId?: string;
  conversationId?: string;
  creationDate?: string;
};

export function getConversationPartyUsername(
  conversation: EbayConversationSummary,
): string | null {
  return (
    conversation.otherPartyUsername?.trim() ||
    conversation.otherParty?.username?.trim() ||
    null
  );
}

export function getConversationPreviewText(
  conversation: EbayConversationSummary,
): string {
  const preview =
    conversation.latestMessage ??
    conversation.lastMessage ??
    conversation.messagePreview;

  return preview?.messageText?.trim() || "No preview";
}

export function getConversationPreviewDate(
  conversation: EbayConversationSummary,
): string | null {
  const preview =
    conversation.latestMessage ??
    conversation.lastMessage ??
    conversation.messagePreview;

  return preview?.creationDate ?? null;
}

export function isConversationUnread(
  conversation: EbayConversationSummary,
): boolean {
  if (conversation.read === false) {
    return true;
  }

  const status = conversation.conversationStatus?.toUpperCase();
  return status === "UNREAD";
}
