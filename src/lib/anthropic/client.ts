/**
 * Thin Anthropic Messages client (server-only).
 * Mirrors getAmazonConfig / amazonFetch — plain fetch, no SDK.
 */

export class AnthropicApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "AnthropicApiError";
    this.status = status;
    this.body = body;
  }
}

export function getAnthropicConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  const model =
    process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001";

  return {
    apiKey,
    model,
    isConfigured: Boolean(apiKey),
    apiBaseUrl: "https://api.anthropic.com",
    version: "2023-06-01",
  };
}

type AnthropicContentBlock = {
  type?: string;
  text?: string;
};

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
  error?: { message?: string; type?: string };
};

type AnthropicMessagesOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
};

export async function anthropicMessages(
  options: AnthropicMessagesOptions,
): Promise<string> {
  const config = getAnthropicConfig();
  if (!config.isConfigured) {
    throw new AnthropicApiError(
      "Anthropic is not configured. Add ANTHROPIC_API_KEY.",
      400,
      "",
    );
  }

  const response = await fetch(`${config.apiBaseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": config.version,
    },
    body: JSON.stringify({
      model: options.model || config.model,
      max_tokens: options.maxTokens ?? 512,
      system: options.system,
      messages: [{ role: "user", content: options.user }],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new AnthropicApiError(
      `Anthropic Messages failed (${response.status})`,
      response.status,
      text.slice(0, 800),
    );
  }

  let parsed: AnthropicMessagesResponse;
  try {
    parsed = JSON.parse(text) as AnthropicMessagesResponse;
  } catch {
    throw new AnthropicApiError(
      "Anthropic returned invalid JSON.",
      502,
      text.slice(0, 400),
    );
  }

  const rewritten = (parsed.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!rewritten) {
    throw new AnthropicApiError(
      "Anthropic returned empty text.",
      502,
      text.slice(0, 400),
    );
  }

  return rewritten;
}
