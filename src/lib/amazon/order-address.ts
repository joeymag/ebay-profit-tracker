import { AmazonApiError, amazonFetch } from "@/lib/amazon/client";
import type { MarketplaceAddress } from "@/lib/marketplace-orders/types";

export class AmazonAddressAccessError extends Error {
  constructor() {
    super(
      "Amazon hid the shipping address. In Seller Central, give this app the Direct-to-Consumer Shipping role, then reconnect Amazon in Settings.",
    );
    this.name = "AmazonAddressAccessError";
  }
}

type AddressFields = {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  city?: string;
  stateOrRegion?: string;
  postalCode?: string;
  countryCode?: string;
  phone?: string;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asAddress(value: unknown): MarketplaceAddress | null {
  if (!value || typeof value !== "object") return null;
  const address = value as AddressFields;
  const line2 = [text(address.addressLine2), text(address.addressLine3)]
    .filter(Boolean)
    .join(", ");
  const mapped: MarketplaceAddress = {
    name: text(address.name),
    address1: text(address.addressLine1),
    address2: line2 || null,
    city: text(address.city),
    province: text(address.stateOrRegion),
    zip: text(address.postalCode),
    countryCode: text(address.countryCode),
    phone: text(address.phone),
  };
  if (!mapped.address1 && !mapped.zip && !mapped.city) return null;
  return mapped;
}

function addressFromOrder(order: unknown): MarketplaceAddress | null {
  if (!order || typeof order !== "object") return null;
  const record = order as {
    recipient?: { deliveryAddress?: unknown };
    ShippingAddress?: unknown;
  };
  return (
    asAddress(record.recipient?.deliveryAddress) ??
    asAddress(record.ShippingAddress)
  );
}

function orderIdFrom(order: unknown): string | null {
  if (!order || typeof order !== "object") return null;
  const record = order as { orderId?: string; AmazonOrderId?: string };
  return text(record.orderId) ?? text(record.AmazonOrderId);
}

function isAccessDenied(error: unknown): boolean {
  return error instanceof AmazonApiError && error.status === 403;
}

async function restrictedDataToken(
  resources: Array<{ method: "GET"; path: string }>,
): Promise<string> {
  const data = await amazonFetch<{ restrictedDataToken?: string }>({
    method: "POST",
    path: "/tokens/2021-03-01/restrictedDataToken",
    body: { restrictedResources: resources },
  });
  const token = data.restrictedDataToken?.trim();
  if (!token) {
    throw new AmazonAddressAccessError();
  }
  return token;
}

async function addressesFromCurrentApi(
  orderIds: string[],
): Promise<Map<string, MarketplaceAddress>> {
  const addresses = new Map<string, MarketplaceAddress>();
  for (const orderId of orderIds) {
    const data = await amazonFetch<{ order?: unknown }>({
      path: `/orders/2026-01-01/orders/${encodeURIComponent(orderId)}`,
      query: { includedData: "RECIPIENT" },
    });
    const address = addressFromOrder(data.order ?? data);
    if (address) addresses.set(orderId, address);
  }
  return addresses;
}

async function addressesFromRestrictedToken(
  orderIds: string[],
): Promise<Map<string, MarketplaceAddress>> {
  const addresses = new Map<string, MarketplaceAddress>();
  for (let index = 0; index < orderIds.length; index += 50) {
    const batch = orderIds.slice(index, index + 50);
    const token = await restrictedDataToken(
      batch.map((orderId) => ({
        method: "GET" as const,
        path: `/orders/v0/orders/${orderId}/address`,
      })),
    );
    for (const orderId of batch) {
      const data = await amazonFetch<{
        payload?: { ShippingAddress?: unknown; AmazonOrderId?: string };
      }>({
        path: `/orders/v0/orders/${encodeURIComponent(orderId)}/address`,
        accessToken: token,
      });
      const address = addressFromOrder(data.payload);
      const id = orderIdFrom(data.payload) ?? orderId;
      if (address) addresses.set(id, address);
    }
  }
  return addresses;
}

/** Shipping addresses for merchant-fulfilled Amazon orders. */
export async function fetchAmazonShippingAddresses(
  orderIds: string[],
): Promise<Map<string, MarketplaceAddress>> {
  const ids = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    40,
  );
  if (ids.length === 0) return new Map();

  try {
    return await addressesFromCurrentApi(ids);
  } catch (error) {
    if (isAccessDenied(error)) throw new AmazonAddressAccessError();
    if (!(error instanceof AmazonApiError) || error.status !== 404) {
      throw error;
    }
  }

  try {
    return await addressesFromRestrictedToken(ids);
  } catch (error) {
    if (isAccessDenied(error)) throw new AmazonAddressAccessError();
    throw error;
  }
}
