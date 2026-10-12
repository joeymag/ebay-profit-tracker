import { getEbayConfig } from "@/lib/ebay/config";
import { ebayFulfillmentFetch } from "@/lib/ebay/fulfillment-client";
import type { MarketplaceSale } from "@/lib/marketplace-orders/types";

type EbayAmount = { value?: string; currency?: string };

type EbayOrder = {
  orderId?: string;
  creationDate?: string;
  orderPaymentStatus?: string;
  cancelStatus?: { cancelState?: string };
  pricingSummary?: {
    deliveryCost?: { value?: string; currency?: string };
  };
  buyer?: {
    buyerRegistrationAddress?: {
      email?: string;
      fullName?: string;
      primaryPhone?: { phoneNumber?: string };
      contactAddress?: EbayAddress;
    };
  };
  fulfillmentStartInstructions?: Array<{
    shippingStep?: {
      shipTo?: {
        fullName?: string;
        email?: string;
        primaryPhone?: { phoneNumber?: string };
        contactAddress?: EbayAddress;
      };
    };
  }>;
  lineItems?: Array<{
    sku?: string;
    title?: string;
    quantity?: number;
    lineItemCost?: EbayAmount;
  }>;
};

type EbayAddress = {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countryCode?: string;
};

type EbayOrdersResponse = {
  orders?: EbayOrder[];
  total?: number;
  next?: string;
};

function recentRange(days: number): { start: string; end: string } {
  // eBay rejects the filter when the end time is even a few seconds ahead of its clock.
  const end = new Date(Date.now() - 2 * 60 * 1000);
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function money(amount: EbayAmount | undefined): number {
  const value = Number(amount?.value);
  return Number.isFinite(value) ? value : 0;
}

function mapAddress(
  name: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined,
  address: EbayAddress | undefined,
): MarketplaceSale["address"] {
  if (!address?.addressLine1 && !address?.postalCode && !name) return null;
  return {
    name: name?.trim() || null,
    address1: address?.addressLine1?.trim() || null,
    address2: address?.addressLine2?.trim() || null,
    city: address?.city?.trim() || null,
    province: address?.stateOrProvince?.trim() || null,
    zip: address?.postalCode?.trim() || null,
    countryCode: address?.countryCode?.trim() || null,
    phone: phone?.trim() || null,
  };
}

function toSale(order: EbayOrder): MarketplaceSale | null {
  const orderId = order.orderId?.trim();
  if (!orderId) return null;
  if (order.cancelStatus?.cancelState === "CANCELED") return null;
  if (
    order.orderPaymentStatus &&
    order.orderPaymentStatus !== "PAID" &&
    order.orderPaymentStatus !== "PARTIALLY_REFUNDED"
  ) {
    return null;
  }

  const shipTo = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
  const buyer = order.buyer?.buyerRegistrationAddress;
  const lines = (order.lineItems ?? [])
    .map((line) => {
      const quantity = line.quantity ?? 0;
      if (quantity <= 0) return null;
      const total = money(line.lineItemCost);
      return {
        sku: line.sku?.trim() || null,
        title: line.title?.trim() || line.sku?.trim() || "eBay item",
        quantity,
        unitPrice: total / quantity,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line != null);

  if (lines.length === 0) return null;

  const currency =
    order.lineItems?.find((line) => line.lineItemCost?.currency)?.lineItemCost
      ?.currency || "GBP";

  return {
    channel: "eBay",
    orderId,
    createdAt: order.creationDate || new Date().toISOString(),
    currency,
    email: shipTo?.email?.trim() || buyer?.email?.trim() || null,
    shipping: money(order.pricingSummary?.deliveryCost),
    address: mapAddress(
      shipTo?.fullName || buyer?.fullName,
      shipTo?.email || buyer?.email,
      shipTo?.primaryPhone?.phoneNumber || buyer?.primaryPhone?.phoneNumber,
      shipTo?.contactAddress || buyer?.contactAddress,
    ),
    lines,
  };
}

export async function fetchRecentEbayCancelledIds(days: number): Promise<string[]> {
  getEbayConfig();
  const { start, end } = recentRange(days);
  const filter = `lastmodifieddate:[${start}..${end}]`;
  const ids: string[] = [];
  let offset = 0;

  for (let page = 0; page < 2; page += 1) {
    const { data } = await ebayFulfillmentFetch<EbayOrdersResponse>(
      `/order?filter=${encodeURIComponent(filter)}&limit=50&offset=${offset}`,
    );
    const batch = data.orders ?? [];
    for (const order of batch) {
      const orderId = order.orderId?.trim();
      if (orderId && order.cancelStatus?.cancelState === "CANCELED") {
        ids.push(orderId);
      }
    }
    if (batch.length < 50) break;
    offset += 50;
  }

  return ids;
}

export async function fetchRecentEbaySales(days: number): Promise<MarketplaceSale[]> {
  getEbayConfig();
  const { start, end } = recentRange(days);
  const filter = `creationdate:[${start}..${end}]`;
  const sales: MarketplaceSale[] = [];
  let offset = 0;

  for (let page = 0; page < 4; page += 1) {
    const { data } = await ebayFulfillmentFetch<EbayOrdersResponse>(
      `/order?filter=${encodeURIComponent(filter)}&limit=50&offset=${offset}`,
    );
    const batch = data.orders ?? [];
    for (const order of batch) {
      const sale = toSale(order);
      if (sale) sales.push(sale);
    }
    if (batch.length < 50) break;
    offset += 50;
  }

  return sales;
}
