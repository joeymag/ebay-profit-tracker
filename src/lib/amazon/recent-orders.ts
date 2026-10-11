import { amazonFetch } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import type { MarketplaceSale } from "@/lib/marketplace-orders/types";

type AmazonMoney = { CurrencyCode?: string; Amount?: string };

type AmazonOrder = {
  AmazonOrderId?: string;
  PurchaseDate?: string;
  OrderStatus?: string;
  BuyerInfo?: { BuyerEmail?: string };
  ShippingAddress?: {
    Name?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    StateOrRegion?: string;
    PostalCode?: string;
    CountryCode?: string;
    Phone?: string;
  };
};

type AmazonOrderItem = {
  SellerSKU?: string;
  Title?: string;
  QuantityOrdered?: number;
  ItemPrice?: AmazonMoney;
  ShippingPrice?: AmazonMoney;
};

const IMPORT_STATUSES = new Set(["Unshipped", "PartiallyShipped", "Shipped"]);

function amount(value: AmazonMoney | undefined): number {
  const parsed = Number(value?.Amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchRecentAmazonSales(days: number): Promise<MarketplaceSale[]> {
  const { marketplaceId } = getAmazonConfig();
  const createdAfter = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const orders: AmazonOrder[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < 3; page += 1) {
    const data = await amazonFetch<{
      payload?: { Orders?: AmazonOrder[]; NextToken?: string };
    }>({
      path: "/orders/v0/orders",
      query: {
        MarketplaceIds: marketplaceId,
        CreatedAfter: createdAfter,
        OrderStatuses: "Unshipped,PartiallyShipped,Shipped",
        MaxResultsPerPage: "50",
        NextToken: nextToken,
      },
    });
    orders.push(...(data.payload?.Orders ?? []));
    nextToken = data.payload?.NextToken;
    if (!nextToken) break;
  }

  const sales: MarketplaceSale[] = [];
  for (const order of orders.slice(0, 40)) {
    const orderId = order.AmazonOrderId?.trim();
    if (!orderId || !IMPORT_STATUSES.has(order.OrderStatus ?? "")) continue;

    const items = await amazonFetch<{
      payload?: { OrderItems?: AmazonOrderItem[] };
    }>({
      path: `/orders/v0/orders/${encodeURIComponent(orderId)}/orderItems`,
    });

    let shipping = 0;
    const lines = (items.payload?.OrderItems ?? [])
      .map((item) => {
        const quantity = item.QuantityOrdered ?? 0;
        if (quantity <= 0) return null;
        shipping += amount(item.ShippingPrice);
        return {
          sku: item.SellerSKU?.trim() || null,
          title: item.Title?.trim() || item.SellerSKU?.trim() || "Amazon item",
          quantity,
          unitPrice: amount(item.ItemPrice) / quantity,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line != null);

    if (lines.length === 0) continue;

    const address = order.ShippingAddress;
    const currency =
      items.payload?.OrderItems?.find((item) => item.ItemPrice?.CurrencyCode)
        ?.ItemPrice?.CurrencyCode || "GBP";

    sales.push({
      channel: "Amazon",
      orderId,
      createdAt: order.PurchaseDate || new Date().toISOString(),
      currency,
      email: order.BuyerInfo?.BuyerEmail?.trim() || null,
      shipping,
      address: address
        ? {
            name: address.Name?.trim() || null,
            address1: address.AddressLine1?.trim() || null,
            address2: address.AddressLine2?.trim() || null,
            city: address.City?.trim() || null,
            province: address.StateOrRegion?.trim() || null,
            zip: address.PostalCode?.trim() || null,
            countryCode: address.CountryCode?.trim() || null,
            phone: address.Phone?.trim() || null,
          }
        : null,
      lines,
    });
  }

  return sales;
}
