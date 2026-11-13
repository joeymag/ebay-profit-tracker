import { NextResponse } from "next/server";

import {
  AnthropicApiError,
  anthropicMessages,
  getAnthropicConfig,
} from "@/lib/anthropic/client";
import {
  AMAZON_BACKEND_SEARCH_MAX_BYTES,
  AMAZON_TITLE_SOFT_MAX,
  utf8ByteLength,
} from "@/lib/amazon/seo-checker";

export const maxDuration = 60;

type RewriteField = "title" | "backend";

type RewriteBody = {
  field?: string;
  text?: string;
  issueIds?: string[];
  issues?: string[];
  keywords?: Array<{ phrase?: string; tier?: string }>;
  context?: {
    title?: string;
    bullets?: string[];
    description?: string;
  };
};

function cleanModelText(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return text.replace(/^["']|["']$/g, "").trim();
}

function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd();
}

function truncateUtf8Bytes(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;
  let end = text.length;
  while (end > 0 && utf8ByteLength(text.slice(0, end)) > maxBytes) {
    end -= 1;
  }
  return text.slice(0, end).trimEnd();
}

function buildSystemPrompt(field: RewriteField, issueIds: string[]): string {
  const flags = new Set(issueIds);
  if (field === "title") {
    return [
      "You rewrite Amazon product titles for UK sellers.",
      `Hard limit: at most ${AMAZON_TITLE_SOFT_MAX} characters (including spaces).`,
      "Keep factual product specs; never invent claims, materials, sizes, or certifications.",
      "Prefer: Brand/top phrase - keyword groups. No keyword stuffing. No markdown.",
      "Return only the rewritten title as plain text.",
    ].join(" ");
  }

  const rules = [
    "You rewrite Amazon backend search terms (generic_keyword) for UK sellers.",
    `Hard limit: at most ${AMAZON_BACKEND_SEARCH_MAX_BYTES} UTF-8 bytes.`,
    "Use space-separated search terms only (no commas needed). No brand spam. No markdown.",
    "Do not invent product claims. Prefer useful synonyms/search phrases not already covered on-page.",
  ];
  if (flags.has("backend-dupes")) {
    rules.push("Remove duplicate words.");
  }
  if (flags.has("backend-overlap")) {
    rules.push(
      "Drop terms already present in the title, bullets, or description when possible.",
    );
  }
  if (flags.has("backend-over")) {
    rules.push("Shorten aggressively to fit the byte limit.");
  }
  if (flags.has("backend-under")) {
    rules.push(
      "You may add a few relevant unused synonyms if there is spare capacity.",
    );
  }
  rules.push("Return only the rewritten search terms as plain text.");
  return rules.join(" ");
}

function buildUserPrompt(body: {
  field: RewriteField;
  text: string;
  issues: string[];
  keywords: Array<{ phrase: string; tier: string }>;
  context?: RewriteBody["context"];
}): string {
  const parts = [
    `Field: ${body.field}`,
    `Current text:\n${body.text}`,
  ];
  if (body.issues.length) {
    parts.push(`Issues to fix:\n- ${body.issues.join("\n- ")}`);
  }
  if (body.keywords.length) {
    parts.push(
      `Target keywords:\n${body.keywords
        .map((row) => `- (${row.tier}) ${row.phrase}`)
        .join("\n")}`,
    );
  }
  if (body.field === "backend" && body.context) {
    const ctx = [
      body.context.title ? `Title: ${body.context.title}` : null,
      body.context.bullets?.filter(Boolean).length
        ? `Bullets: ${body.context.bullets.filter(Boolean).join(" | ")}`
        : null,
      body.context.description
        ? `Description: ${body.context.description.slice(0, 500)}`
        : null,
    ].filter(Boolean);
    if (ctx.length) parts.push(`On-page context:\n${ctx.join("\n")}`);
  }
  parts.push("Rewrite now. Plain text only.");
  return parts.join("\n\n");
}

export async function POST(request: Request) {
  const config = getAnthropicConfig();
  if (!config.isConfigured) {
    return NextResponse.json(
      {
        ok: false,
        code: "NOT_CONFIGURED",
        error:
          "Missing Anthropic credentials. Add ANTHROPIC_API_KEY to the server environment.",
      },
      { status: 400 },
    );
  }

  let body: RewriteBody;
  try {
    body = (await request.json()) as RewriteBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const field = body.field?.trim() as RewriteField | undefined;
  if (field !== "title" && field !== "backend") {
    return NextResponse.json(
      { ok: false, error: 'field must be "title" or "backend".' },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "text is required." },
      { status: 400 },
    );
  }

  const issueIds = Array.isArray(body.issueIds)
    ? body.issueIds.filter((id): id is string => typeof id === "string")
    : [];
  const issues = Array.isArray(body.issues)
    ? body.issues.filter((msg): msg is string => typeof msg === "string")
    : [];
  const keywords = Array.isArray(body.keywords)
    ? body.keywords
        .filter(
          (row): row is { phrase: string; tier: string } =>
            typeof row?.phrase === "string" && row.phrase.trim().length > 0,
        )
        .map((row) => ({
          phrase: row.phrase.trim(),
          tier: typeof row.tier === "string" ? row.tier : "secondary",
        }))
    : [];

  try {
    const raw = await anthropicMessages({
      system: buildSystemPrompt(field, issueIds),
      user: buildUserPrompt({
        field,
        text,
        issues,
        keywords,
        context: body.context,
      }),
      maxTokens: field === "title" ? 256 : 320,
    });

    let rewrittenText = cleanModelText(raw);
    if (field === "title") {
      rewrittenText = truncateChars(rewrittenText, AMAZON_TITLE_SOFT_MAX);
      return NextResponse.json({
        ok: true,
        field,
        rewrittenText,
      });
    }

    rewrittenText = truncateUtf8Bytes(
      rewrittenText,
      AMAZON_BACKEND_SEARCH_MAX_BYTES,
    );
    return NextResponse.json({
      ok: true,
      field,
      rewrittenText,
      bytesUsed: utf8ByteLength(rewrittenText),
    });
  } catch (error) {
    if (error instanceof AnthropicApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.body.slice(0, 400) || undefined,
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to rewrite listing text.",
      },
      { status: 500 },
    );
  }
}
