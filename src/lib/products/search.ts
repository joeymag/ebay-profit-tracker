import type { Product } from "@/lib/products/types";

export function filterProductsBySearch(
  products: Product[],
  query: string,
): Product[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return products;
  }

  return products.filter((product) => {
    if (product.title.toLowerCase().includes(needle)) {
      return true;
    }
    if (product.sku.toLowerCase().includes(needle)) {
      return true;
    }
    if (product.temuSku?.toLowerCase().includes(needle)) {
      return true;
    }
    return false;
  });
}
