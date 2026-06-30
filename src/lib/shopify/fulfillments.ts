import { shopifyAdminFetch } from "@/lib/shopify/client";
import { deliveredAtFromFulfillments } from "@/lib/shopify/shipping";
import type {
  ShopifyFulfillment,
  ShopifyFulfillmentEvent,
} from "@/lib/shopify/types";

type FulfillmentsResponse = {
  fulfillments: ShopifyFulfillment[];
};

type FulfillmentEventsResponse = {
  fulfillment_events: ShopifyFulfillmentEvent[];
};

export type OrderFulfillmentData = {
  fulfillments: ShopifyFulfillment[];
  deliveredAt: string | null;
};

function latestTimestamp(values: string[]): string | null {
  const sorted = values.filter(Boolean).sort((a, b) => a.localeCompare(b));
  return sorted.at(-1) ?? null;
}

function isDeliveredStatus(status: string | null | undefined): boolean {
  return status?.trim().toLowerCase() === "delivered";
}

async function fetchDeliveredAtForFulfillment(
  shopifyOrderId: number,
  fulfillment: ShopifyFulfillment,
): Promise<string | null> {
  if (!isDeliveredStatus(fulfillment.shipment_status)) {
    return null;
  }

  if (fulfillment.id != null) {
    try {
      const { fulfillment_events } =
        await shopifyAdminFetch<FulfillmentEventsResponse>(
          `/orders/${shopifyOrderId}/fulfillments/${fulfillment.id}/events.json`,
        );

      const events = fulfillment_events ?? [];
      const deliveredAt = latestTimestamp(
        events
          .filter((event) => isDeliveredStatus(event.status))
          .map((event) => event.happened_at ?? event.created_at ?? ""),
      );

      if (deliveredAt) {
        return deliveredAt;
      }

      // Some carriers never emit a delivered event; use the latest tracking event.
      const latestEventAt = latestTimestamp(
        events.map((event) => event.happened_at ?? event.created_at ?? ""),
      );
      if (latestEventAt) {
        return latestEventAt;
      }
    } catch {
      // Fall back to fulfillment updated_at below.
    }
  }

  return fulfillment.updated_at?.trim() || null;
}

async function resolveDeliveredAt(
  shopifyOrderId: number,
  fulfillments: ShopifyFulfillment[],
): Promise<string | null> {
  const timestamps: string[] = [];

  for (const fulfillment of fulfillments) {
    const deliveredAt = await fetchDeliveredAtForFulfillment(
      shopifyOrderId,
      fulfillment,
    );
    if (deliveredAt) {
      timestamps.push(deliveredAt);
    }
  }

  return latestTimestamp(timestamps) ?? deliveredAtFromFulfillments(fulfillments);
}

export async function fetchOrderFulfillments(
  shopifyOrderId: number,
): Promise<ShopifyFulfillment[]> {
  const { fulfillments } = await shopifyAdminFetch<FulfillmentsResponse>(
    `/orders/${shopifyOrderId}/fulfillments.json`,
  );
  return fulfillments ?? [];
}

export async function fetchFulfillmentsForOrders(
  shopifyOrderIds: number[],
  options?: { concurrency?: number },
): Promise<Map<number, OrderFulfillmentData>> {
  const result = new Map<number, OrderFulfillmentData>();
  const concurrency = options?.concurrency ?? 8;

  for (let i = 0; i < shopifyOrderIds.length; i += concurrency) {
    const batch = shopifyOrderIds.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (id) => {
        try {
          const fulfillments = await fetchOrderFulfillments(id);
          const deliveredAt = await resolveDeliveredAt(id, fulfillments);
          return { id, fulfillments, deliveredAt };
        } catch {
          return {
            id,
            fulfillments: [] as ShopifyFulfillment[],
            deliveredAt: null,
          };
        }
      }),
    );

    for (const { id, fulfillments, deliveredAt } of settled) {
      if (fulfillments.length) {
        result.set(id, { fulfillments, deliveredAt });
      }
    }
  }

  return result;
}

export function deliveredAtFromFulfillmentData(
  data: OrderFulfillmentData | undefined,
): string | null {
  return data?.deliveredAt ?? null;
}
