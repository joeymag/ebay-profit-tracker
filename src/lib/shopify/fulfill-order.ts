import { shopifyAdminGraphql } from "@/lib/shopify/graphql";

export async function fulfillShopifyOrderWithTracking(input: {
  shopifyOrderId: number;
  trackingNumber: string;
  trackingCompany?: string | null;
  trackingUrl?: string | null;
  notifyCustomer?: boolean;
}): Promise<"fulfilled" | "already"> {
  const orderId = `gid://shopify/Order/${input.shopifyOrderId}`;
  const data = await shopifyAdminGraphql<{
    order: {
      displayFulfillmentStatus: string | null;
      fulfillmentOrders: {
        nodes: Array<{
          id: string;
          status: string;
          lineItems: { nodes: Array<{ id: string; remainingQuantity: number }> };
        }>;
      };
    } | null;
  }>(
    `#graphql
      query OrderToFulfill($id: ID!) {
        order(id: $id) {
          displayFulfillmentStatus
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
              lineItems(first: 30) {
                nodes { id remainingQuantity }
              }
            }
          }
        }
      }
    `,
    { id: orderId },
  );

  const status = data.order?.displayFulfillmentStatus?.toUpperCase();
  if (status === "FULFILLED") return "already";

  const open = (data.order?.fulfillmentOrders.nodes ?? []).filter(
    (node) => node.status === "OPEN" || node.status === "IN_PROGRESS",
  );
  const lineItemsByFulfillmentOrder = open
    .map((node) => ({
      fulfillmentOrderId: node.id,
      fulfillmentOrderLineItems: node.lineItems.nodes
        .filter((line) => line.remainingQuantity > 0)
        .map((line) => ({ id: line.id, quantity: line.remainingQuantity })),
    }))
    .filter((node) => node.fulfillmentOrderLineItems.length > 0);

  if (lineItemsByFulfillmentOrder.length === 0) return "already";

  const created = await shopifyAdminGraphql<{
    fulfillmentCreate: {
      userErrors: Array<{ message: string }>;
    };
  }>(
    `#graphql
      mutation FulfillWithTracking($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          userErrors { field message }
        }
      }
    `,
    {
      fulfillment: {
        notifyCustomer: input.notifyCustomer === true,
        trackingInfo: {
          number: input.trackingNumber,
          company: input.trackingCompany || undefined,
          url: input.trackingUrl || undefined,
        },
        lineItemsByFulfillmentOrder,
      },
    },
  );

  const errors = created.fulfillmentCreate.userErrors.map((error) => error.message);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return "fulfilled";
}
