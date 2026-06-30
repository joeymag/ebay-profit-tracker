export type ShopifyMoney = {
  amount: string;
  currency_code: string;
};

export type ShopifyAddress = {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  country_code: string | null;
  phone: string | null;
};

export type ShopifyCustomer = {
  first_name: string | null;
  last_name: string | null;
  display_name?: string | null;
};

export type ShopifyNoteAttribute = {
  name: string;
  value: string;
};

export type ShopifyLineItem = {
  id: number;
  title: string;
  quantity: number;
  sku: string | null;
  price: string;
  product_id?: number | null;
  variant_id?: number | null;
};

export type ShopifyShippingLine = {
  title: string;
  code: string | null;
  source: string | null;
  carrier_identifier: string | null;
  is_removed?: boolean;
};

export type ShopifyFulfillment = {
  id?: number;
  tracking_company: string | null;
  service: string | null;
  tracking_number: string | null;
  tracking_numbers?: string[];
  tracking_url: string | null;
  tracking_urls?: string[];
  /** Carrier tracking state from Shopify, e.g. in_transit, delivered. */
  shipment_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ShopifyFulfillmentEvent = {
  status: string;
  happened_at?: string | null;
  created_at?: string | null;
};

export type ShopifyOrder = {
  id: number;
  name: string;
  created_at: string;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  source_name?: string;
  currency: string;
  customer?: ShopifyCustomer | null;
  shipping_address?: ShopifyAddress | null;
  billing_address?: ShopifyAddress | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: {
    shop_money: ShopifyMoney;
  };
  shipping_lines: ShopifyShippingLine[];
  fulfillments?: ShopifyFulfillment[];
  note_attributes?: ShopifyNoteAttribute[];
  line_items: ShopifyLineItem[];
};

export type ShopifyOrdersResponse = {
  orders: ShopifyOrder[];
};
