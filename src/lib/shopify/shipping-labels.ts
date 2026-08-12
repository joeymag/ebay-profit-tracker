import { shopifyAdminFetch, ShopifyApiError } from "@/lib/shopify/client";

type OrderEvent = {
  id: number;
  verb: string;
  message: string;
  created_at: string;
};

type OrderEventsResponse = {
  events: OrderEvent[];
};

function parseMoneyAmount(message: string): number | null {
  const match =
    message.match(/(?:£|\$|€)\s*([\d,]+(?:\.\d{1,2})?)/) ??
    message.match(/(?:GBP|USD|EUR)\s*([\d,]+(?:\.\d{1,2})?)/i) ??
    message.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:GBP|USD|EUR)/i) ??
    message.match(/for\s+([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

/** Parses Shopify label purchase messages (GBP/USD/EUR). */
export function parseShippingLabelCost(message: string): number | null {
  const lower = message.toLowerCase();
  const looksLikeLabel =
    lower.includes("shipping label") ||
    lower.includes("purchased a shipping label") ||
    lower.includes("purchased an shipping label");
  if (!looksLikeLabel) {
    return null;
  }
  return parseMoneyAmount(message);
}

function isShippingLabelCostEvent(event: OrderEvent): boolean {
  const verb = event.verb.toLowerCase();
  if (
    verb === "shipping_label_created_success" ||
    verb === "external_shipping_label_created_success" ||
    verb.includes("shipping_label")
  ) {
    return parseShippingLabelCost(event.message) != null;
  }
  return false;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchOrderShippingLabelEvents(
  shopifyOrderId: number,
): Promise<OrderEvent[]> {
  const { events } = await shopifyAdminFetch<OrderEventsResponse>(
    `/orders/${shopifyOrderId}/events.json`,
  );
  return events ?? [];
}

/**
 * Total label spend from order timeline events, plus the most recent single
 * label charge (useful right after a purchase).
 */
export async function fetchOrderShippingLabelCosts(
  shopifyOrderId: number,
): Promise<{ total: number; latest: number | null }> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const events = await fetchOrderShippingLabelEvents(shopifyOrderId);
      let total = 0;
      let latest: number | null = null;
      let latestAt = "";

      for (const event of events) {
        if (!isShippingLabelCostEvent(event)) {
          continue;
        }
        const cost = parseShippingLabelCost(event.message);
        if (cost == null) {
          continue;
        }
        total += cost;
        if (!latestAt || event.created_at >= latestAt) {
          latestAt = event.created_at;
          latest = cost;
        }
      }

      return { total, latest };
    } catch (error) {
      const isRateLimit =
        error instanceof ShopifyApiError && error.status === 429;
      if (isRateLimit && attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      return { total: 0, latest: null };
    }
  }

  return { total: 0, latest: null };
}

export async function fetchOrderShippingLabelCost(
  shopifyOrderId: number,
): Promise<number> {
  const { total } = await fetchOrderShippingLabelCosts(shopifyOrderId);
  return total;
}

export async function fetchShippingLabelCostsForOrders(
  shopifyOrderIds: number[],
  options?: { concurrency?: number; onProgress?: (done: number, total: number) => void },
): Promise<Map<number, number>> {
  const costs = new Map<number, number>();
  const uniqueIds = [...new Set(shopifyOrderIds)];
  const concurrency = options?.concurrency ?? 3;
  let done = 0;

  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const batch = uniqueIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (id) => {
        const cost = await fetchOrderShippingLabelCost(id);
        return { id, cost };
      }),
    );

    for (const { id, cost } of results) {
      if (cost > 0) {
        costs.set(id, cost);
      }
    }

    done += batch.length;
    options?.onProgress?.(done, uniqueIds.length);
  }

  return costs;
}
