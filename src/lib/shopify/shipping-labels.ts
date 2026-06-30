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

/** Parses Shopify label purchase messages (GBP/USD/EUR). */
export function parseShippingLabelCost(message: string): number | null {
  const lower = message.toLowerCase();
  if (
    !lower.includes("purchased a shipping label") &&
    !lower.includes("purchased an shipping label")
  ) {
    return null;
  }

  const match =
    message.match(/(?:£|\$|€)\s*([\d,]+(?:\.\d{1,2})?)/) ??
    message.match(/for\s+([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchOrderShippingLabelCost(
  shopifyOrderId: number,
): Promise<number> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { events } = await shopifyAdminFetch<OrderEventsResponse>(
        `/orders/${shopifyOrderId}/events.json`,
      );

      let total = 0;

      for (const event of events) {
        if (
          event.verb === "shipping_label_created_success" ||
          event.verb === "external_shipping_label_created_success"
        ) {
          const cost = parseShippingLabelCost(event.message);
          if (cost != null) {
            total += cost;
          }
        }
      }

      return total;
    } catch (error) {
      const isRateLimit =
        error instanceof ShopifyApiError && error.status === 429;
      if (isRateLimit && attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      return 0;
    }
  }

  return 0;
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
