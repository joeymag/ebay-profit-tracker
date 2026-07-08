"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  EbayConversationMessage,
  EbayConversationSummary,
} from "@/lib/ebay/message-types";
import {
  getConversationPartyUsername,
  getConversationPreviewDate,
  getConversationPreviewText,
  isConversationUnread,
} from "@/lib/ebay/message-types";

type ApiError = {
  ok: false;
  error: string;
  code?: string;
  details?: string;
};

type ConversationsResponse =
  | { ok: true; conversations?: EbayConversationSummary[] }
  | ApiError;

type ConversationResponse =
  | {
      ok: true;
      conversation?: {
        conversationId?: string;
        messages?: EbayConversationMessage[];
      };
    }
  | ApiError;

type SendResponse =
  | {
      ok: true;
      result?: { conversationId?: string; messageId?: string };
    }
  | ApiError;

function formatMessageDate(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function EbayMessagesPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedConversationId = searchParams.get("conversation");
  const composeUsername = searchParams.get("user") ?? "";

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [conversations, setConversations] = useState<EbayConversationSummary[]>(
    [],
  );
  const [messages, setMessages] = useState<EbayConversationMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [listError, setListError] = useState<ApiError | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newUsername, setNewUsername] = useState(composeUsername);
  const [showCompose, setShowCompose] = useState(Boolean(composeUsername));

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.conversationId === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const threadTitle = selectedConversation
    ? getConversationPartyUsername(selectedConversation) ?? "Conversation"
    : showCompose
      ? newUsername.trim() || "New message"
      : "Select a conversation";

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    setListError(null);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "unread") {
        params.set("conversation_status", "UNREAD");
      }

      const response = await fetch(
        `/api/ebay/messages/conversations?${params.toString()}`,
      );
      const data = (await response.json()) as ConversationsResponse;

      if (!data.ok) {
        setConversations([]);
        setListError(data);
        return;
      }

      setConversations(data.conversations ?? []);
    } catch {
      setConversations([]);
      setListError({
        ok: false,
        error: "Could not load conversations.",
      });
    } finally {
      setLoadingList(false);
    }
  }, [filter]);

  const loadThread = useCallback(async (conversationId: string) => {
    setLoadingThread(true);
    setThreadError(null);

    try {
      const response = await fetch(
        `/api/ebay/messages/conversations/${encodeURIComponent(conversationId)}`,
      );
      const data = (await response.json()) as ConversationResponse;

      if (!data.ok) {
        setMessages([]);
        setThreadError(data.error);
        return;
      }

      const threadMessages = [...(data.conversation?.messages ?? [])].sort(
        (a, b) =>
          new Date(a.creationDate ?? 0).getTime() -
          new Date(b.creationDate ?? 0).getTime(),
      );
      setMessages(threadMessages);

      await fetch(
        `/api/ebay/messages/conversations/${encodeURIComponent(conversationId)}`,
        { method: "POST" },
      );
    } catch {
      setMessages([]);
      setThreadError("Could not load messages.");
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    setNewUsername(composeUsername);
    if (composeUsername) {
      setShowCompose(true);
    }
  }, [composeUsername]);

  useEffect(() => {
    if (selectedConversationId) {
      setShowCompose(false);
      void loadThread(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId, loadThread]);

  function openConversation(conversationId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("conversation", conversationId);
    params.delete("user");
    router.push(`/ebay-messages?${params.toString()}`);
    setShowCompose(false);
  }

  function startCompose() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("conversation");
    router.push(`/ebay-messages?${params.toString()}`);
    setShowCompose(true);
    setMessages([]);
    setDraft("");
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const messageText = draft.trim();
    if (!messageText || sending) {
      return;
    }

    setSending(true);
    setThreadError(null);

    try {
      const body: {
        messageText: string;
        conversationId?: string;
        otherPartyUsername?: string;
      } = { messageText };

      if (selectedConversationId) {
        body.conversationId = selectedConversationId;
      } else {
        const username = newUsername.trim();
        if (!username) {
          setThreadError("Enter the buyer's eBay username.");
          return;
        }
        body.otherPartyUsername = username;
      }

      const response = await fetch("/api/ebay/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as SendResponse;

      if (!data.ok) {
        setThreadError(data.error);
        return;
      }

      setDraft("");
      await loadConversations();

      const nextConversationId =
        data.result?.conversationId ?? selectedConversationId;
      if (nextConversationId) {
        openConversation(nextConversationId);
      } else {
        setShowCompose(false);
      }
    } catch {
      setThreadError("Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (listError?.code === "NOT_CONNECTED") {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Connect eBay first</CardTitle>
          <CardDescription>
            Link your eBay seller account in Settings to read and send buyer
            messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings" className="text-primary underline underline-offset-4">
            Go to Settings
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (listError?.code === "SCOPE_REQUIRED") {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>Reconnect eBay for messaging</CardTitle>
          <CardDescription>
            Your current eBay connection does not include the messaging permission.
            Disconnect and connect again in Settings to grant{" "}
            <code className="text-xs">commerce.message</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings" className="text-primary underline underline-offset-4">
            Reconnect in Settings
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
      <Card className="surface-card overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="size-5" />
                Inbox
              </CardTitle>
              <CardDescription>Buyer messages from eBay</CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadConversations()}
              disabled={loadingList}
            >
              <RefreshCw className={cn("size-4", loadingList && "animate-spin")} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              All
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filter === "unread" ? "default" : "outline"}
              onClick={() => setFilter("unread")}
            >
              Unread
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={startCompose}>
              New message
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto p-0">
          {loadingList ? (
            <div className="flex items-center gap-2 p-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading conversations…
            </div>
          ) : listError ? (
            <p className="p-6 text-sm text-destructive">{listError.error}</p>
          ) : conversations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No conversations found. Use New message to contact a buyer by eBay
              username.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {conversations.map((conversation) => {
                const conversationId = conversation.conversationId;
                if (!conversationId) {
                  return null;
                }

                const username = getConversationPartyUsername(conversation);
                const unread = isConversationUnread(conversation);
                const active = conversationId === selectedConversationId;

                return (
                  <li key={conversationId}>
                    <button
                      type="button"
                      onClick={() => openConversation(conversationId)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-muted/40",
                        active && "bg-muted/60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{username ?? "eBay member"}</p>
                        {unread ? <Badge>New</Badge> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {getConversationPreviewText(conversation)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatMessageDate(getConversationPreviewDate(conversation))}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="surface-card flex min-h-[480px] flex-col overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle>{threadTitle}</CardTitle>
          <CardDescription>
            {selectedConversationId
              ? "Reply in this thread. Messages sync with eBay Seller Hub."
              : showCompose
                ? "Start a conversation using the buyer's eBay username."
                : "Choose a conversation or start a new message."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 p-0">
          {showCompose && !selectedConversationId ? (
            <div className="border-b border-border/50 px-4 py-3">
              <label
                htmlFor="ebay-message-username"
                className="text-sm font-medium text-muted-foreground"
              >
                eBay username
              </label>
              <Input
                id="ebay-message-username"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="buyer_username"
                className="mt-2 font-mono"
              />
            </div>
          ) : null}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loadingThread ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {selectedConversationId || showCompose
                  ? "No messages yet. Send the first message below."
                  : "Select a conversation from the inbox."}
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.messageId ?? `${message.creationDate}-${message.messageText}`}
                  className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {message.senderUsername ?? "Unknown sender"}
                    </span>
                    <span>{formatMessageDate(message.creationDate)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {message.messageText ?? ""}
                  </p>
                </div>
              ))
            )}
          </div>

          {(selectedConversationId || showCompose) && (
            <form
              onSubmit={handleSend}
              className="border-t border-border/50 bg-muted/10 p-4"
            >
              <label
                htmlFor="ebay-message-draft"
                className="text-sm font-medium text-muted-foreground"
              >
                Message
              </label>
              <textarea
                id="ebay-message-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Type your reply…"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {draft.length}/2000 characters
                </p>
                <Button type="submit" disabled={sending || !draft.trim()}>
                  {sending ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      Send
                    </>
                  )}
                </Button>
              </div>
              {threadError ? (
                <p className="mt-2 text-sm text-destructive">{threadError}</p>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
