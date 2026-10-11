export type MarketplaceLine = {
  sku: string | null;
  title: string;
  quantity: number;
  unitPrice: number;
};

export type MarketplaceAddress = {
  name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  countryCode: string | null;
  phone: string | null;
};

export function marketplaceOrderTag(
  channel: "eBay" | "Amazon",
  orderId: string,
): string {
  const prefix = channel === "eBay" ? "ebay-order" : "amazon-order";
  return `${prefix}-${orderId}`.slice(0, 40);
}

export type MarketplaceSale = {
  channel: "eBay" | "Amazon";
  orderId: string;
  createdAt: string;
  currency: string;
  email: string | null;
  shipping: number;
  address: MarketplaceAddress | null;
  lines: MarketplaceLine[];
};
