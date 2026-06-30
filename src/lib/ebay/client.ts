import { getEbayAccessToken } from "@/lib/ebay/auth";
import { getEbayConfig } from "@/lib/ebay/config";

export class EbayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "EbayApiError";
  }
}

export async function ebayFinancesFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { financesBaseUrl } = getEbayConfig();
  const accessToken = await getEbayAccessToken();
  const url = `${financesBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new EbayApiError(
      `eBay Finances API error (${response.status})`,
      response.status,
      text,
    );
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type EbayTransaction = {
  transactionId?: string;
  orderId?: string;
  transactionType?: string;
  transactionDate?: string;
  amount?: { value?: string; currency?: string };
  totalFeeAmount?: { value?: string; currency?: string };
  orderLineItems?: Array<{
    marketplaceFees?: Array<{
      feeType?: string;
      amount?: { value?: string; currency?: string };
    }>;
  }>;
};

export type EbayTransactionsResponse = {
  transactions?: EbayTransaction[];
  total?: number;
};

export async function getEbayTransactionsForOrder(
  ebayOrderId: string,
): Promise<EbayTransaction[]> {
  const filter = encodeURIComponent(`orderId:{${ebayOrderId}}`);
  const data = await ebayFinancesFetch<EbayTransactionsResponse>(
    `/transaction?filter=${filter}&limit=200`,
  );
  return data.transactions ?? [];
}
