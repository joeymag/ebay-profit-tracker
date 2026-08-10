export type Product = {
  sku: string;
  title: string;
  unitCost: number | null;
  /** Default postage / label cost used for pre-sale profit estimates. */
  defaultPostage: number | null;
  imageUrl: string | null;
  shopifyProductId: number | null;
  temuSku: string | null;
  updatedAt: string;
  /** How many order line items use this SKU. */
  orderLineCount: number;
};

export type ProductCatalog = Map<string, number>;
