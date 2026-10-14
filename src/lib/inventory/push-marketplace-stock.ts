import { amazonFetch, AmazonApiError } from "@/lib/amazon/client";
import { getAmazonConfig } from "@/lib/amazon/config";
import { resolveAmazonSellerId } from "@/lib/amazon/pricing";
import { getStoredAmazonRefreshToken } from "@/lib/amazon/token-store";
import { ebayInventoryFetch } from "@/lib/ebay/inventory-client";
import { getStoredEbayRefreshToken } from "@/lib/ebay/token-store";
import {
  ebayTradingCall,
  escapeXml,
  extractXmlTag,
} from "@/lib/ebay/trading-client";
import { EbayApiError } from "@/lib/ebay/errors";

export type MarketplaceQuantityResult = {
  channel: "eBay" | "Amazon";
  updated: boolean;
  skipped: boolean;
  message: string;
};

function errorText(error: unknown): string {
  if (error instanceof EbayApiError) {
    return (
      extractXmlTag(error.body ?? "", "ShortMessage") ??
      error.message
    ).slice(0, 240);
  }
  if (error instanceof AmazonApiError) {
    return error.message.slice(0, 240);
  }
  if (error instanceof Error) return error.message.slice(0, 240);
  return "Could not update listing quantity.";
}

async function pushEbayInventoryQuantity(
  sku: string,
  quantity: number,
): Promise<boolean> {
  const data = await ebayInventoryFetch<{
    responses?: Array<{ statusCode?: number }>;
  }>("/bulk_update_price_quantity", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          sku,
          shipToLocationAvailability: { quantity },
        },
      ],
    }),
  });
  const status = data.responses?.[0]?.statusCode ?? 200;
  return status >= 200 && status < 300;
}

async function pushEbayTradingQuantity(
  sku: string,
  quantity: number,
): Promise<void> {
  const xml = await ebayTradingCall(
    "GetItem",
    `<SKU>${escapeXml(sku)}</SKU>
<OutputSelector>Item.ItemID</OutputSelector>
<OutputSelector>Item.SKU</OutputSelector>
<OutputSelector>Item.Variations.Variation.SKU</OutputSelector>`,
  );
  const itemId = extractXmlTag(xml, "ItemID");
  if (!itemId) {
    throw new Error(`No eBay listing found for SKU ${sku}.`);
  }

  await ebayTradingCall(
    "ReviseInventoryStatus",
    `<InventoryStatus>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <SKU>${escapeXml(sku)}</SKU>
  <Quantity>${quantity}</Quantity>
</InventoryStatus>`,
  );
}

async function pushEbayQuantity(
  sku: string,
  quantity: number,
): Promise<MarketplaceQuantityResult> {
  if (!(await getStoredEbayRefreshToken())) {
    return {
      channel: "eBay",
      updated: false,
      skipped: true,
      message: "eBay is not connected.",
    };
  }

  let inventoryUpdated = false;
  let inventoryError = "";
  try {
    inventoryUpdated = await pushEbayInventoryQuantity(sku, quantity);
  } catch (error) {
    inventoryError = errorText(error);
  }

  let tradingUpdated = false;
  let tradingError = "";
  try {
    await pushEbayTradingQuantity(sku, quantity);
    tradingUpdated = true;
  } catch (error) {
    tradingError = errorText(error);
  }

  if (inventoryUpdated || tradingUpdated) {
    return {
      channel: "eBay",
      updated: true,
      skipped: false,
      message: "eBay listing quantity updated.",
    };
  }

  const missing = /not found|invalid sku|does not exist|no eBay listing|404/i.test(
    tradingError,
  );
  return {
    channel: "eBay",
    updated: false,
    skipped: missing,
    message: missing
      ? `No eBay listing found for SKU ${sku}.`
      : tradingError || inventoryError || `No eBay listing found for SKU ${sku}.`,
  };
}

type AmazonListingItem = {
  fulfillmentAvailability?: Array<{
    fulfillmentChannelCode?: string;
    quantity?: number;
  }>;
};

async function pushAmazonQuantity(
  sku: string,
  quantity: number,
): Promise<MarketplaceQuantityResult> {
  if (!getAmazonConfig().isConfigured || !(await getStoredAmazonRefreshToken())) {
    return {
      channel: "Amazon",
      updated: false,
      skipped: true,
      message: "Amazon is not connected.",
    };
  }

  try {
    const { marketplaceId } = getAmazonConfig();
    const sellerId = await resolveAmazonSellerId(sku);
    const encodedSeller = encodeURIComponent(sellerId);
    const encodedSku = encodeURIComponent(sku);
    const current = await amazonFetch<AmazonListingItem>({
      path: `/listings/2021-08-01/items/${encodedSeller}/${encodedSku}`,
      query: {
        marketplaceIds: marketplaceId,
        includedData: "fulfillmentAvailability",
      },
    });

    const channels = current.fulfillmentAvailability ?? [];
    const merchantFulfilled = channels.some(
      (row) => (row.fulfillmentChannelCode ?? "DEFAULT") === "DEFAULT",
    );
    if (channels.length > 0 && !merchantFulfilled) {
      return {
        channel: "Amazon",
        updated: false,
        skipped: true,
        message: "Amazon fulfils this SKU, so the quantity stays with Amazon.",
      };
    }

    await amazonFetch({
      method: "PATCH",
      path: `/listings/2021-08-01/items/${encodedSeller}/${encodedSku}`,
      query: { marketplaceIds: marketplaceId },
      body: {
        productType: "PRODUCT",
        patches: [
          {
            op: "replace",
            path: "/attributes/fulfillment_availability",
            value: [
              {
                fulfillment_channel_code: "DEFAULT",
                quantity,
              },
            ],
          },
        ],
      },
    });

    return {
      channel: "Amazon",
      updated: true,
      skipped: false,
      message: "Amazon listing quantity updated.",
    };
  } catch (error) {
    const message = errorText(error);
    const noListing = /404|not found/i.test(message);
    return {
      channel: "Amazon",
      updated: false,
      skipped: noListing,
      message: noListing ? `No Amazon listing found for SKU ${sku}.` : message,
    };
  }
}

export async function pushMarketplaceListingQuantity(
  sku: string,
  quantity: number,
): Promise<MarketplaceQuantityResult[]> {
  const [ebay, amazon] = await Promise.all([
    pushEbayQuantity(sku, quantity),
    pushAmazonQuantity(sku, quantity),
  ]);
  return [ebay, amazon];
}

export function summarizeMarketplacePush(
  results: MarketplaceQuantityResult[],
): string {
  const updated = results.filter((result) => result.updated).map((result) => result.channel);
  const notes = results
    .filter((result) => !result.updated && !/not connected/i.test(result.message))
    .map((result) => `${result.channel}: ${result.message}`);
  const parts: string[] = [];
  if (updated.length > 0) {
    parts.push(`Listing quantity updated on ${updated.join(" and ")}.`);
  }
  parts.push(...notes);
  return parts.join(" ");
}
