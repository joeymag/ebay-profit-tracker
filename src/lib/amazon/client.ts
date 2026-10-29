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
};

export async function amazonFetch<T = unknown>(
  options: AmazonFetchOptions,
): Promise<T> {
  const config = getAmazonConfig();
  const accessToken = options.accessToken ?? (await getAmazonAccessToken());

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
  if (!response.ok) {
    throw new AmazonApiError(
      `Amazon SP-API ${options.path} failed (${response.status})`,
      response.status,
      text.slice(0, 800),
    );
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
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
