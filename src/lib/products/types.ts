export type Product = {
  sku: string;
  title: string;
  unitCost: number | null;
  imageUrl: string | null;
  shopifyProductId: number | null;
  updatedAt: string;
  /** How many order line items use this SKU. */
  orderLineCount: number;
};

export type ProductCatalog = Map<string, number>;
