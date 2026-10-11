import { marketplaceOrderTag } from "@/lib/marketplace-orders/types";
import { shopifyAdminGraphql } from "@/lib/shopify/graphql";

type ShopifyOrderNode = {
  id: string;
  cancelledAt: string | null;
};

async function findShopifyOrder(
  channel: "eBay" | "Amazon",
  orderId: string,
): Promise<ShopifyOrderNode | null> {
  const tag = marketplaceOrderTag(channel, orderId).replace(/"/g, '\\"');
  const data = await shopifyAdminGraphql<{
    orders: { edges: Array<{ node: ShopifyOrderNode }> };
  }>(
    `#graphql
      query MarketplaceOrderToCancel($query: String!) {
        orders(first: 1, query: $query) {
          edges { node { id cancelledAt } }
        }
      }
    `,
    { query: `tag:"${tag}"` },
  );
  return data.orders.edges[0]?.node ?? null;
}

/** Cancel the Shopify copy of a marketplace order and put the stock back. */
export async function cancelShopifyMarketplaceOrder(
  channel: "eBay" | "Amazon",
  orderId: string,
): Promise<"cancelled" | "already" | "missing"> {
  const order = await findShopifyOrder(channel, orderId);
  if (!order) return "missing";
  if (order.cancelledAt) return "already";

  const data = await shopifyAdminGraphql<{
    orderCancel: {
      orderCancelUserErrors: Array<{ message: string }>;
      userErrors: Array<{ message: string }>;
    };
  }>(
    `#graphql
      mutation CancelMarketplaceOrder(
        $orderId: ID!
        $reason: OrderCancelReason!
        $restock: Boolean!
        $refundMethod: OrderCancelRefundMethodInput!
        $staffNote: String
      ) {
        orderCancel(
          orderId: $orderId
          notifyCustomer: false
          reason: $reason
          restock: $restock
          refundMethod: $refundMethod
          staffNote: $staffNote
        ) {
          orderCancelUserErrors { message }
          userErrors { message }
        }
      }
    `,
    {
      orderId: order.id,
      reason: "CUSTOMER",
      restock: true,
      refundMethod: { originalPaymentMethodsRefund: false },
      staffNote: `Cancelled on ${channel}. Order ${orderId}.`.slice(0, 255),
    },
  );

  const errors = [
    ...data.orderCancel.orderCancelUserErrors,
    ...data.orderCancel.userErrors,
  ].map((error) => error.message);
  if (errors.some((message) => /already been cancel|already cancelled/i.test(message))) {
    return "already";
  }
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return "cancelled";
}
