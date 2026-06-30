export type StoredLineItem = {
  id: number;
  title: string;
  quantity: number;
  sku: string | null;
  price: number;
  productId: number | null;
  variantId: number | null;
  imageUrl: string | null;
  /** Unit cost from products catalog (matched by SKU). */
  unitCost: number | null;
};

export type StoredShippingAddress = {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  countryCode: string | null;
  phone: string | null;
};

export type StoredOrder = {
  shopifyId: number;
  orderNumber: string;
  createdAt: string;
  /** Set when Shopify cancels the order (financial_status may still be "paid"). */
  cancelledAt: string | null;
  financialStatus: string;
  fulfillmentStatus: string | null;
  /** Shopify order tags (e.g. eBay-GB for eBay channel orders). */
  tags: string | null;
  /** Buyer / ship-to name from Shopify. */
  buyerName: string | null;
  /** eBay buyer username from Shopify name, e.g. janedoe123 from "Jane Doe (janedoe123)". */
  ebayUsername: string | null;
  /** eBay marketplace order ID from Shopify note attributes. */
  ebayOrderId: string | null;
  /** Amazon marketplace order ID from Shopify note attributes. */
  amazonOrderId: string | null;
  /** Amazon deliver-by deadline from Shopify note attributes. */
  amazonDeliverByAt: string | null;
  /** eBay deliver-by deadline from Shopify note attributes. */
  ebayDeliverByAt: string | null;
  /** Ship-to address from Shopify (shipping, then billing fallback). */
  shippingAddress: StoredShippingAddress | null;
  /** Geocoded coordinates for mapping order origins. */
  latitude: number | null;
  longitude: number | null;
  /** Human-readable region from geocoder (e.g. local authority / county). */
  geocodeRegion: string | null;
  geocodedAt: string | null;
  currency: string;
  revenue: number;
  subtotal: number;
  tax: number;
  /** Shipping charged to the customer. */
  shippingCharged: number;
  /** Postage paid via Shopify shipping label purchase. */
  shippingLabelCost: number | null;
  /** eBay final value fee rate (decimal, e.g. 0.128 = 12.8%). */
  ebayFeeRate: number | null;
  /** eBay promoted listings / ads fee rate (decimal). */
  ebayAdsFeeRate: number | null;
  /** Actual total eBay fees from Finances API (GBP, incl VAT where applicable). */
  ebayFeesActual: number | null;
  /** Actual eBay promoted listings / ads fee from Finances API. */
  ebayAdsFeeActual: number | null;
  /** When eBay fees were last synced from Finances API. */
  ebayFeesSyncedAt: string | null;
  /** Product/unit cost (ex-VAT from catalog or manual entry). */
  productCost: number | null;
  /** When true, product cost was set manually and should not be overwritten by catalog. */
  productCostManual: boolean;
  /** eBay / buyer-selected service (shipping_lines). */
  shippingService: string | null;
  /** Actual carrier from Shopify fulfillment label. */
  shippingCarrier: string | null;
  trackingNumbers: string[];
  trackingUrl: string | null;
  /** Shopify fulfillment shipment_status, e.g. in_transit, delivered. */
  shipmentStatus: string | null;
  /** When Shopify recorded delivery (fulfillment event or update time). */
  deliveredAt: string | null;
  itemCount: number;
  /** Amazon marketplace fee (18.5% of revenue) when order is Amazon-tagged. */
  platformFee: number | null;
  /** Total cost (product + postage + platform fees). */
  cost: number | null;
  profit: number | null;
  lineItems: StoredLineItem[];
};

export type OrdersDatabase = {
  syncedAt: string | null;
  orders: StoredOrder[];
};
