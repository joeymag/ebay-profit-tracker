import { shopifyAdminGraphql } from "@/lib/shopify/graphql";

export type PackSheetCompanyInfo = {
  name: string | null;
  website: string | null;
  addressLines: string[];
};

type ShopQuery = {
  shop: {
    name: string;
    primaryDomain: { url: string; host: string } | null;
    billingAddress: {
      company: string | null;
      address1: string | null;
      address2: string | null;
      city: string | null;
      province: string | null;
      zip: string | null;
      country: string | null;
      phone: string | null;
    } | null;
  };
};

function envLine(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function addressLinesFromEnv(): string[] {
  const raw = process.env.PACK_SHEET_ADDRESS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n|\s*\|\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function addressLinesFromShopify(
  address: ShopQuery["shop"]["billingAddress"],
): string[] {
  if (!address) {
    return [];
  }
  const cityLine = [address.city, address.province, address.zip]
    .filter(Boolean)
    .join(", ");
  return [
    address.company,
    address.address1,
    address.address2,
    cityLine || null,
    address.country,
    address.phone ? `Tel: ${address.phone}` : null,
  ]
    .map((line) => line?.trim() || null)
    .filter((line): line is string => Boolean(line));
}

/**
 * Company block for pack sheets.
 * Prefers PACK_SHEET_* env overrides, otherwise Shopify shop billing details.
 */
export async function getPackSheetCompanyInfo(): Promise<PackSheetCompanyInfo> {
  const envName = envLine(process.env.PACK_SHEET_COMPANY_NAME);
  const envWebsite = envLine(process.env.PACK_SHEET_WEBSITE);
  const envAddress = addressLinesFromEnv();

  if (envName || envWebsite || envAddress.length) {
    return {
      name: envName,
      website: envWebsite,
      addressLines: envAddress,
    };
  }

  try {
    const data = await shopifyAdminGraphql<ShopQuery>(
      `#graphql
      query PackSheetShopHeader {
        shop {
          name
          primaryDomain {
            url
            host
          }
          billingAddress {
            company
            address1
            address2
            city
            province
            zip
            country
            phone
          }
        }
      }`,
    );

    const shop = data.shop;
    const website =
      shop.primaryDomain?.url?.replace(/\/$/, "") ||
      (shop.primaryDomain?.host ? `https://${shop.primaryDomain.host}` : null);

    return {
      name: shop.billingAddress?.company?.trim() || shop.name || null,
      website,
      addressLines: addressLinesFromShopify(shop.billingAddress),
    };
  } catch {
    return { name: null, website: null, addressLines: [] };
  }
}
