import { getEbayConfig } from "@/lib/ebay/config";
import type {
  EbayConversationMessage,
  EbayConversationSummary,
} from "@/lib/ebay/message-types";

function readString(
  source: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

export function getConfiguredSellerUsername(): string | null {
  return getEbayConfig().sellerUsername;
}

export function resolveSellerUsername(
  conversations: EbayConversationSummary[],
): string | null {
  const configured = getConfiguredSellerUsername();
  if (configured) {
    return configured;
  }

  return inferSellerUsername(conversations);
}

export function inferSellerUsername(
  conversations: EbayConversationSummary[],
): string | null {
  const counts = new Map<string, { count: number; display: string }>();

  for (const conversation of conversations) {
    const participants = new Map<string, string>();

    const addParticipant = (username?: string | null) => {
      if (!username?.trim()) {
        return;
      }
      const key = username.trim().toLowerCase();
      if (!participants.has(key)) {
        participants.set(key, username.trim());
      }
    };

    for (const message of conversation.messages ?? []) {
      addParticipant(message.senderUsername);
      addParticipant(message.recipientUsername);
    }

    const latest = getLatestPreviewMessage(conversation);
    addParticipant(latest?.senderUsername);
    addParticipant(latest?.recipientUsername);

    for (const [key, display] of participants) {
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { count: 1, display });
      }
    }
  }

  let best: { count: number; display: string } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }

  if (!best || best.count < 2) {
    return null;
  }

  return best.display;
}

export function pickBuyerUsername(
  senderUsername?: string | null,
  recipientUsername?: string | null,
  sellerUsername?: string | null,
): string | null {
  const seller = sellerUsername?.trim().toLowerCase() ?? null;
  const sender = senderUsername?.trim() ?? null;
  const recipient = recipientUsername?.trim() ?? null;

  if (seller) {
    if (sender && sender.toLowerCase() !== seller) {
      return sender;
    }
    if (recipient && recipient.toLowerCase() !== seller) {
      return recipient;
    }
    return null;
  }

  if (sender && recipient && sender.toLowerCase() !== recipient.toLowerCase()) {
    return sender;
  }

  return sender ?? recipient ?? null;
}

export function normalizeMessage(
  raw: unknown,
): EbayConversationMessage | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const messageId = readString(record, "messageId");
  const messageText = readString(
    record,
    "messageBody",
    "messageText",
    "body",
    "text",
  );
  const creationDate = readString(
    record,
    "createdDate",
    "creationDate",
    "createDate",
  );

  if (!messageId && !messageText && !creationDate) {
    return null;
  }

  return {
    messageId,
    messageText,
    subject: readString(record, "subject"),
    creationDate,
    senderUsername: readString(record, "senderUsername", "fromUsername"),
    recipientUsername: readString(record, "recipientUsername", "toUsername"),
    read:
      typeof record.readStatus === "boolean"
        ? record.readStatus
        : typeof record.read === "boolean"
          ? record.read
          : undefined,
    messageMedia: Array.isArray(record.messageMedia)
      ? record.messageMedia.filter(
          (item): item is { mediaType?: string; mediaUrl?: string } =>
            Boolean(item) && typeof item === "object",
        )
      : undefined,
  };
}

function getLatestPreviewMessage(
  conversation: EbayConversationSummary,
): EbayConversationMessage | undefined {
  return (
    conversation.latestMessage ??
    conversation.lastMessage ??
    conversation.messagePreview
  );
}

export function normalizeConversation(
  raw: unknown,
  sellerUsername?: string | null,
): EbayConversationSummary | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const conversationId = readString(record, "conversationId");
  if (!conversationId) {
    return null;
  }

  const latestRaw =
    record.latestMessage ?? record.lastMessage ?? record.messagePreview;
  const latestMessage = normalizeMessage(latestRaw) ?? undefined;

  const messages = Array.isArray(record.messages)
    ? record.messages
        .map((item) => normalizeMessage(item))
        .filter((item): item is EbayConversationMessage => item != null)
    : undefined;

  let otherPartyUsername =
    readString(record, "otherPartyUsername") ??
    readString(asRecord(record.otherParty), "username") ??
    readString(record, "conversationTitle");

  if (!otherPartyUsername && latestMessage) {
    otherPartyUsername =
      pickBuyerUsername(
        latestMessage.senderUsername,
        latestMessage.recipientUsername,
        sellerUsername,
      ) ?? undefined;
  }

  if (!otherPartyUsername && messages?.length) {
    const last = messages[messages.length - 1];
    otherPartyUsername =
      pickBuyerUsername(
        last?.senderUsername,
        last?.recipientUsername,
        sellerUsername,
      ) ?? undefined;
  }

  return {
    conversationId,
    conversationType: readString(record, "conversationType") as
      | EbayConversationSummary["conversationType"]
      | undefined,
    conversationStatus: readString(record, "conversationStatus"),
    read:
      typeof record.read === "boolean"
        ? record.read
        : typeof record.unreadCount === "number"
          ? record.unreadCount === 0
          : undefined,
    otherPartyUsername,
    latestMessage,
    messages,
    reference: asRecord(record.reference)
      ? {
          referenceType: readString(asRecord(record.reference), "referenceType"),
          referenceId: readString(asRecord(record.reference), "referenceId"),
        }
      : undefined,
  };
}

export function normalizeConversations(
  rawConversations: unknown[] | undefined,
  sellerUsername?: string | null,
): EbayConversationSummary[] {
  const seller = sellerUsername ?? getConfiguredSellerUsername();
  const normalized =
    rawConversations
      ?.map((item) => normalizeConversation(item, seller))
      .filter((item): item is EbayConversationSummary => item != null) ?? [];

  const deduped = new Map<string, EbayConversationSummary>();
  for (const conversation of normalized) {
    if (conversation.conversationId) {
      deduped.set(conversation.conversationId, conversation);
    }
  }

  return [...deduped.values()];
}

export function normalizeConversationDetail(
  raw: unknown,
  sellerUsername?: string | null,
): {
  conversationId?: string;
  messages: EbayConversationMessage[];
  otherPartyUsername?: string;
} {
  const record = asRecord(raw);
  if (!record) {
    return { messages: [] };
  }

  const seller = sellerUsername ?? getConfiguredSellerUsername();
  const summary = normalizeConversation(record, seller);
  const messages = Array.isArray(record.messages)
    ? record.messages
        .map((item) => normalizeMessage(item))
        .filter((item): item is EbayConversationMessage => item != null)
    : (summary?.messages ?? []);

  return {
    conversationId: summary?.conversationId ?? readString(record, "conversationId"),
    otherPartyUsername: summary?.otherPartyUsername,
    messages,
  };
}

export function isSellerMessage(
  message: EbayConversationMessage,
  sellerUsername: string | null | undefined,
): boolean {
  if (!sellerUsername || !message.senderUsername) {
    return false;
  }

  return (
    message.senderUsername.toLowerCase() === sellerUsername.toLowerCase()
  );
}
