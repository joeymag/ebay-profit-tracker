import type { MarketplaceSale } from "@/lib/marketplace-orders/types";
import { marketplaceOrderTag } from "@/lib/marketplace-orders/types";
import { shopifyAdminGraphql } from "@/lib/shopify/graphql";

function countryCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase();
  if (!code) return null;
  if (code === "UK") return "GB";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function splitName(name: string | null): { firstName: string; lastName: string } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return { firstName: "Customer", lastName: "-" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "-" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/** Add a shipping address to a Shopify order that was imported without one. */
export async function fillShopifyOrderAddress(
  sale: MarketplaceSale,
): Promise<boolean> {
  const address = sale.address;
  const country = countryCode(address?.countryCode ?? null);
  if (!address?.address1 || !address.city || !address.zip || !country) {
    return false;
  }

  const tag = marketplaceOrderTag(sale.channel, sale.orderId).replace(/"/g, '\\"');
  const existing = await shopifyAdminGraphql<{
    orders: {
      edges: Array<{
        node: { id: string; shippingAddress: { address1: string | null } | null };
      }>;
    };
  }>(
    `#graphql
      query MarketplaceOrderAddress($query: String!) {
        orders(first: 1, query: $query) {
          edges { node { id shippingAddress { address1 } } }
        }
      }
    `,
    { query: `tag:"${tag}"` },
  );
  const order = existing.orders.edges[0]?.node;
  if (!order || order.shippingAddress?.address1) return false;

  const { firstName, lastName } = splitName(address.name);
  const mailing = {
    firstName,
    lastName,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    zip: address.zip,
    countryCode: country,
    phone: address.phone,
  };
  const data = await shopifyAdminGraphql<{
    orderUpdate: { userErrors: Array<{ message: string }> };
  }>(
    `#graphql
      mutation FillMarketplaceAddress($input: OrderInput!) {
        orderUpdate(input: $input) {
          userErrors { message }
        }
      }
    `,
    {
      input: {
        id: order.id,
        shippingAddress: mailing,
        billingAddress: mailing,
      },
    },
  );
  const errors = data.orderUpdate.userErrors.map((error) => error.message);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return true;
}
