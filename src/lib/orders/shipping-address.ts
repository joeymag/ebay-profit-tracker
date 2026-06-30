import type { ShopifyAddress, ShopifyOrder } from "@/lib/shopify/types";
import type { StoredShippingAddress } from "@/lib/orders/types";

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function addressFromShopify(
  address: ShopifyAddress | null | undefined,
): StoredShippingAddress | null {
  if (!address) {
    return null;
  }

  const parsed: StoredShippingAddress = {
    address1: trimOrNull(address.address1),
    address2: trimOrNull(address.address2),
    city: trimOrNull(address.city),
    province: trimOrNull(address.province),
    zip: trimOrNull(address.zip),
    country: trimOrNull(address.country),
    countryCode: trimOrNull(address.country_code)?.toUpperCase() ?? null,
    phone: trimOrNull(address.phone),
  };

  const hasContent = [
    parsed.address1,
    parsed.address2,
    parsed.city,
    parsed.province,
    parsed.zip,
    parsed.country,
    parsed.phone,
  ].some(Boolean);

  return hasContent ? parsed : null;
}

export function parseShippingAddress(
  order: ShopifyOrder,
): StoredShippingAddress | null {
  return (
    addressFromShopify(order.shipping_address) ??
    addressFromShopify(order.billing_address)
  );
}

export function shippingAddressFromFields(fields: {
  shipping_address1?: string | null;
  shipping_address2?: string | null;
  shipping_city?: string | null;
  shipping_province?: string | null;
  shipping_zip?: string | null;
  shipping_country?: string | null;
  shipping_country_code?: string | null;
  shipping_phone?: string | null;
}): StoredShippingAddress | null {
  const address: StoredShippingAddress = {
    address1: fields.shipping_address1 ?? null,
    address2: fields.shipping_address2 ?? null,
    city: fields.shipping_city ?? null,
    province: fields.shipping_province ?? null,
    zip: fields.shipping_zip ?? null,
    country: fields.shipping_country ?? null,
    countryCode: fields.shipping_country_code ?? null,
    phone: fields.shipping_phone ?? null,
  };

  const hasContent = [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
    address.phone,
  ].some(Boolean);

  return hasContent ? address : null;
}

function stickyField(
  incoming: string | null | undefined,
  previous: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (next) {
    return next;
  }

  const kept = previous?.trim();
  return kept || null;
}

function addressCompleteness(address: StoredShippingAddress | null): number {
  if (!address) {
    return 0;
  }

  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
    address.phone,
  ].filter(Boolean).length;
}

/**
 * Sticky address merge: once address/phone fields are stored, sync must not
 * clear them when Shopify sends sparse or redacted marketplace data.
 * Filled incoming fields still update the record (upgrades allowed).
 */
export function mergeShippingAddressOnSync(
  previous: StoredShippingAddress | null,
  incoming: StoredShippingAddress | null,
): StoredShippingAddress | null {
  if (!previous) {
    return incoming;
  }

  if (!incoming) {
    return previous;
  }

  if (addressCompleteness(incoming) === 0) {
    return previous;
  }

  const merged: StoredShippingAddress = {
    address1: stickyField(incoming.address1, previous.address1),
    address2: stickyField(incoming.address2, previous.address2),
    city: stickyField(incoming.city, previous.city),
    province: stickyField(incoming.province, previous.province),
    zip: stickyField(incoming.zip, previous.zip),
    country: stickyField(incoming.country, previous.country),
    countryCode:
      stickyField(incoming.countryCode, previous.countryCode)?.toUpperCase() ??
      null,
    phone: stickyField(incoming.phone, previous.phone),
  };

  const hasContent = addressCompleteness(merged) > 0;
  return hasContent ? merged : previous;
}

export function shippingAddressToFields(address: StoredShippingAddress | null) {
  return {
    shipping_address1: address?.address1 ?? null,
    shipping_address2: address?.address2 ?? null,
    shipping_city: address?.city ?? null,
    shipping_province: address?.province ?? null,
    shipping_zip: address?.zip ?? null,
    shipping_country: address?.country ?? null,
    shipping_country_code: address?.countryCode ?? null,
    shipping_phone: address?.phone ?? null,
  };
}

export function shippingAddressFingerprint(
  address: StoredShippingAddress | null | undefined,
): string {
  if (!address) {
    return "";
  }

  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.countryCode,
  ]
    .map((part) => part?.trim().toLowerCase() ?? "")
    .join("|");
}

export function formatShippingAddressLines(
  address: StoredShippingAddress | null | undefined,
): string[] {
  if (!address) {
    return [];
  }

  const lines: string[] = [];
  if (address.address1) {
    lines.push(address.address1);
  }
  if (address.address2) {
    lines.push(address.address2);
  }

  const cityLine = [address.city, address.province, address.zip]
    .filter(Boolean)
    .join(", ");
  if (cityLine) {
    lines.push(cityLine);
  }
  if (address.country) {
    lines.push(address.country);
  }

  return lines;
}

export function getShippingPhone(
  address: StoredShippingAddress | null | undefined,
): string | null {
  const phone = address?.phone?.trim();
  return phone || null;
}

export function phoneTelHref(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, "");
  return `tel:${normalized || phone.trim()}`;
}

export function getOrderLocationLabel(order: {
  geocodeRegion: string | null;
  shippingAddress: StoredShippingAddress | null;
}): string {
  if (order.geocodeRegion?.trim()) {
    return order.geocodeRegion.trim();
  }
  if (order.shippingAddress?.city?.trim()) {
    return order.shippingAddress.city.trim();
  }
  if (order.shippingAddress?.province?.trim()) {
    return order.shippingAddress.province.trim();
  }
  if (order.shippingAddress?.zip?.trim()) {
    return order.shippingAddress.zip.trim();
  }
  return "Unknown location";
}
