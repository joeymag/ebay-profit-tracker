import { shopifyAdminFetch } from "@/lib/shopify/client";
import type { StoredOrder } from "@/lib/orders/types";

type ShopifyProductImage = {
  id: number;
  src: string;
  variant_ids?: number[];
};

type ShopifyVariant = {
  id: number;
  image_id: number | null;
};

type ShopifyProduct = {
  id: number;
  images: ShopifyProductImage[];
  image?: ShopifyProductImage | null;
  variants?: ShopifyVariant[];
};

type ProductResponse = { product: ShopifyProduct };

function resolveVariantImageUrl(
  product: ShopifyProduct,
  variantId: number | null,
): string | null {
  if (variantId && product.variants?.length) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant?.image_id) {
      const match = product.images?.find((img) => img.id === variant.image_id);
      if (match?.src) {
        return match.src;
      }
    }
    const byVariant = product.images?.find((img) =>
      img.variant_ids?.includes(variantId),
    );
    if (byVariant?.src) {
      return byVariant.src;
    }
  }

  if (product.images?.length) {
    return product.images[0].src;
  }

  return product.image?.src ?? null;
}

async function fetchProduct(productId: number): Promise<ShopifyProduct | null> {
  try {
    const { product } = await shopifyAdminFetch<ProductResponse>(
      `/products/${productId}.json?fields=id,images,image,variants`,
    );
    return product;
  } catch {
    return null;
  }
}

/** Fetch product images and attach URLs to line items (requires read_products scope). */
export async function enrichOrdersWithLineItemImages(
  orders: StoredOrder[],
  options?: { concurrency?: number },
): Promise<StoredOrder[]> {
  const productIds = new Set<number>();

  for (const order of orders) {
    for (const item of order.lineItems) {
      if (item.productId && !item.imageUrl) {
        productIds.add(item.productId);
      }
    }
  }

  if (!productIds.size) {
    return orders;
  }

  const productCache = new Map<number, ShopifyProduct>();
  const ids = [...productIds];
  const concurrency = options?.concurrency ?? 5;

  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((id) => fetchProduct(id)));
    batch.forEach((id, index) => {
      const product = results[index];
      if (product) {
        productCache.set(id, product);
      }
    });
  }

  return orders.map((order) => ({
    ...order,
    lineItems: order.lineItems.map((item) => {
      if (item.imageUrl || !item.productId) {
        return item;
      }
      const product = productCache.get(item.productId);
      if (!product) {
        return item;
      }
      return {
        ...item,
        imageUrl: resolveVariantImageUrl(product, item.variantId),
      };
    }),
  }));
}
