import { getAmazonAccessToken } from "@/lib/amazon/auth";
import { getAmazonConfig } from "@/lib/amazon/config";

export class AmazonApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "AmazonApiError";
    this.status = status;
    this.body = body;
  }
}

type AmazonFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  /** Restricted Data Token, when the call needs buyer address data. */
  accessToken?: string;
  /** Override default 429 retry count (default 4). */
  maxRetries?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const asSeconds = Number(header);
    if (Number.isFinite(asSeconds) && asSeconds >= 0) {
      return Math.min(60_000, Math.max(250, asSeconds * 1000));
    }
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) {
      return Math.min(60_000, Math.max(250, asDate - Date.now()));
    }
  }
  // Exponential backoff with jitter: 500ms, 1s, 2s, 4s…
  const base = Math.min(30_000, 500 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

export async function amazonFetch<T = unknown>(
  options: AmazonFetchOptions,
): Promise<T> {
  const config = getAmazonConfig();
  const maxRetries = options.maxRetries ?? 4;
  let accessToken = options.accessToken ?? (await getAmazonAccessToken());

  const url = new URL(options.path, config.apiBaseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const method = options.method ?? "GET";
  const hasBody = options.body != null;

  let lastError: AmazonApiError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: {
        "x-amz-access-token": accessToken,
        "User-Agent": config.userAgent,
        // Amazon can 400 GET requests that include Content-Type / Content-Length.
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    if (response.ok) {
      if (!text) {
        return undefined as T;
      }
      return JSON.parse(text) as T;
    }

    lastError = new AmazonApiError(
      `Amazon SP-API ${options.path} failed (${response.status})`,
      response.status,
      text.slice(0, 800),
    );

    const retriable =
      response.status === 429 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;
    if (!retriable || attempt >= maxRetries) {
      throw lastError;
    }

    await sleep(retryAfterMs(response, attempt));
    // Refresh token in case a long backoff crossed expiry.
    if (!options.accessToken) {
      accessToken = await getAmazonAccessToken();
    }
  }

  throw lastError ?? new AmazonApiError(`Amazon SP-API ${options.path} failed`, 0, "");
}

type MarketplaceParticipation = {
  marketplace?: {
    id?: string;
    name?: string;
    countryCode?: string;
  };
};

type MarketplaceParticipationsResponse = {
  payload?: MarketplaceParticipation[];
};

/** Lightweight connectivity check (does not require Restricted Data Token). */
export async function fetchAmazonMarketplaceParticipations() {
  return amazonFetch<MarketplaceParticipationsResponse>({
    path: "/sellers/v1/marketplaceParticipations",
  });
}

/**
 * Static sandbox Orders probe from Amazon's onboarding Step 5.
 * @see https://developer-docs.amazon.com/sp-api/docs/onboarding-step-5-make-your-first-call-to-the-sp-api-sandbox
 */
export async function fetchAmazonSandboxOrdersProbe() {
  return amazonFetch<{ payload?: { Orders?: unknown[] } }>({
    path: "/orders/v0/orders",
    query: {
      MarketplaceIds: "ATVPDKIKX0DER",
      CreatedAfter: "TEST_CASE_200",
    },
  });
}
