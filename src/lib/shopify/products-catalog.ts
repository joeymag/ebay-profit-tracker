import { shopifyAdminFetchWithLink } from "@/lib/shopify/client";

export type ShopifyCatalogVariant = {
  sku: string;
  title: string;
  imageUrl: string | null;
  shopifyProductId: number;
};

type ShopifyProductRest = {
  id: number;
  title: string;
  image?: { src: string } | null;
  variants: {
    id: number;
    title: string;
    sku: string | null;
  }[];
};

function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(",")) {
    const section = part.trim();
    if (section.endsWith('rel="next"')) {
      const match = section.match(/page_info=([^&>]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

const EMBEDDED_VARIANT_LIMIT = 100;
const VARIANTS_PAGE_LIMIT = 250;

async function fetchAllVariantsForProduct(
  productId: number,
): Promise<ShopifyProductRest["variants"]> {
  const variants: ShopifyProductRest["variants"] = [];
  let pageInfo: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const path = pageInfo
      ? `/products/${productId}/variants.json?limit=${VARIANTS_PAGE_LIMIT}&fields=id,title,sku&page_info=${pageInfo}`
      : `/products/${productId}/variants.json?limit=${VARIANTS_PAGE_LIMIT}&fields=id,title,sku`;

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      variants: ShopifyProductRest["variants"];
    }>(path);

    variants.push(...(data.variants ?? []));
    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  return variants;
}

function variantTitle(productTitle: string, variantTitle: string): string {
  return variantTitle === "Default Title"
    ? productTitle
    : `${productTitle} — ${variantTitle}`;
}

/** All Shopify product variants that have a SKU (catalog source for Products page). */
export async function fetchAllShopifyCatalogVariants(options?: {
  maxPages?: number;
}): Promise<ShopifyCatalogVariant[]> {
  const maxPages = options?.maxPages ?? 80;
  const bySku = new Map<string, ShopifyCatalogVariant>();
  let pageInfo: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const path = pageInfo
      ? `/products.json?limit=250&fields=id,title,image,variants&page_info=${pageInfo}`
      : "/products.json?limit=250&fields=id,title,image,variants";

    const { data, linkHeader } = await shopifyAdminFetchWithLink<{
      products: ShopifyProductRest[];
    }>(path);

    const products = data.products ?? [];
    const variantLists = await Promise.all(
      products.map(async (product) => {
        const embedded = product.variants ?? [];
        if (embedded.length < EMBEDDED_VARIANT_LIMIT) {
          return embedded;
        }
        return fetchAllVariantsForProduct(product.id);
      }),
    );

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]!;
      const variants = variantLists[index] ?? [];

      for (const variant of variants) {
        const sku = variant.sku?.trim();
        if (!sku) {
          continue;
        }

        bySku.set(sku, {
          sku,
          title: variantTitle(product.title, variant.title),
          imageUrl: product.image?.src ?? null,
          shopifyProductId: product.id,
        });
      }
    }

    pageInfo = parseNextPageInfo(linkHeader);
    if (!pageInfo) {
      break;
    }
  }

  return [...bySku.values()].sort((a, b) => a.title.localeCompare(b.title));
}
