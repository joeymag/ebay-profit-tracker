import {
  applyDescriptionTemplate,
  DESCRIPTION_TEMPLATE_BATCH_SIZE,
} from "@/lib/ebay/apply-description-template";
import { getEbayDescriptionTemplate } from "@/lib/ebay/description-template";
import { reviseEbayListingSkuAndPrice } from "@/lib/ebay/listing-details";
import {
  ebayTradingCall,
  escapeXml,
  extractXmlTag,
} from "@/lib/ebay/trading-client";

export { DESCRIPTION_TEMPLATE_BATCH_SIZE };

export type BulkDescriptionResult = {
  listingId: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

function descriptionFromItem(itemXml: string): string {
  const withoutVariations = itemXml.replace(
    /<Variations\b[^>]*>[\s\S]*<\/Variations>/i,
    "",
  );
  const raw = extractXmlTag(withoutVariations, "Description");
  if (!raw) return "";
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return (cdata?.[1] ?? raw).trim();
}

function sameHtml(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

async function fetchDescriptionFields(listingId: string): Promise<{
  title: string;
  description: string;
  imageUrl: string | null;
  format: string | null;
}> {
  const xml = await ebayTradingCall(
    "GetItem",
    `
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ItemID>${escapeXml(listingId)}</ItemID>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
  <OutputSelector>Item.Title</OutputSelector>
  <OutputSelector>Item.Description</OutputSelector>
  <OutputSelector>Item.ListingType</OutputSelector>
  <OutputSelector>Item.PictureDetails.PictureURL</OutputSelector>
  <OutputSelector>Item.PictureDetails.GalleryURL</OutputSelector>`,
  );
  const itemXml = extractXmlTag(xml, "Item");
  if (!itemXml) {
    throw new Error(`Listing ${listingId} was not returned by eBay.`);
  }
  if (!/<Description\b/i.test(itemXml)) {
    throw new Error(
      "eBay did not return the description, so this listing was left unchanged.",
    );
  }
  return {
    title: extractXmlTag(itemXml, "Title")?.trim() ?? "",
    description: descriptionFromItem(itemXml),
    imageUrl:
      extractXmlTag(itemXml, "PictureURL") ??
      extractXmlTag(itemXml, "GalleryURL"),
    format: extractXmlTag(itemXml, "ListingType"),
  };
}

export async function applyDescriptionTemplateToListings(
  listingIds: string[],
): Promise<BulkDescriptionResult[]> {
  const template = await getEbayDescriptionTemplate();
  const results: BulkDescriptionResult[] = [];

  for (const listingId of listingIds) {
    const trimmedId = listingId.trim();
    if (!trimmedId) continue;

    try {
      const current = await fetchDescriptionFields(trimmedId);
      const next = applyDescriptionTemplate(
        template,
        current.title,
        current.description,
        current.imageUrl,
      );
      if (next.length > 500_000) {
        throw new Error("Description is longer than eBay allows.");
      }
      if (current.description && sameHtml(current.description, next)) {
        results.push({ listingId: trimmedId, ok: true, skipped: true });
        continue;
      }
      await reviseEbayListingSkuAndPrice({
        listingId: trimmedId,
        isMultiVariation: false,
        format: current.format,
        currency: "GBP",
        variations: [],
        description: next,
      });
      results.push({ listingId: trimmedId, ok: true });
    } catch (error) {
      results.push({
        listingId: trimmedId,
        ok: false,
        error: error instanceof Error ? error.message : "Could not update the description.",
      });
    }
  }

  return results;
}
