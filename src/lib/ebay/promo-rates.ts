import { getEbayConfig } from "@/lib/ebay/config";
import { EbayApiError } from "@/lib/ebay/errors";
import { ebayMarketingFetch } from "@/lib/ebay/marketing-client";

export type EbayListingPromoRate = {
  listingId: string;
  /** Ad rate percent, e.g. 12 means 12%. */
  bidPercentage: number | null;
  adStatus: string | null;
  adId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  fundingModel: string | null;
};

export type EbayPromoRatesResult = {
  ratesByListingId: Record<string, EbayListingPromoRate>;
  campaignsScanned: number;
  adsScanned: number;
  warning: string | null;
};

type Campaign = {
  campaignId?: string;
  campaignName?: string;
  campaignStatus?: string;
  marketplaceId?: string;
  fundingStrategy?: {
    fundingModel?: string;
  };
};

type CampaignsResponse = {
  campaigns?: Campaign[];
  href?: string;
  limit?: number;
  offset?: number;
  total?: number;
  next?: string;
};

type Ad = {
  adId?: string;
  listingId?: string;
  bidPercentage?: string;
  adStatus?: string;
};

type AdsResponse = {
  ads?: Ad[];
  href?: string;
  limit?: number;
  offset?: number;
  total?: number;
  next?: string;
};

const AD_PAGE_SIZE = 200;
const MAX_AD_PAGES_PER_CAMPAIGN = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBidPercentage(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }

  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

/** eBay accepts 1.0–100.0 with at most one decimal place. */
export function normalizeBidPercentage(value: number): number {
  const clamped = Math.min(100, Math.max(1, value));
  return Math.round(clamped * 10) / 10;
}

export function formatBidPercentageForApi(value: number): string {
  return normalizeBidPercentage(value).toFixed(1);
}

export async function updateEbayListingPromoBid(input: {
  campaignId: string;
  adId: string;
  bidPercentage: number;
}): Promise<void> {
  const campaignId = input.campaignId.trim();
  const adId = input.adId.trim();
  if (!campaignId || !adId) {
    throw new Error("Campaign ID and ad ID are required to update promo rate.");
  }

  await ebayMarketingFetch(
    `/ad_campaign/${encodeURIComponent(campaignId)}/ad/${encodeURIComponent(adId)}/update_bid`,
    {
      method: "POST",
      body: JSON.stringify({
        bidPercentage: formatBidPercentageForApi(input.bidPercentage),
      }),
    },
  );
}

export async function updateEbayPromoRateByListingId(input: {
  listingId: string;
  bidPercentage: number;
  campaignId?: string | null;
  adId?: string | null;
}): Promise<EbayListingPromoRate> {
  const listingId = input.listingId.trim();
  if (!listingId) {
    throw new Error("Listing ID is required.");
  }

  let campaignId = input.campaignId?.trim() || null;
  let adId = input.adId?.trim() || null;
  let existing: EbayListingPromoRate | undefined;

  if (!campaignId || !adId) {
    const promo = await fetchEbayPromoRatesByListingId({ listingIds: [listingId] });
    existing = promo.ratesByListingId[listingId];
    campaignId = existing?.campaignId ?? null;
    adId = existing?.adId ?? null;
  }

  if (!campaignId || !adId) {
    throw new Error(
      "This listing is not in a Promoted Listings campaign. Set a promo rate here for profit estimates only.",
    );
  }

  const bidPercentage = normalizeBidPercentage(input.bidPercentage);
  await updateEbayListingPromoBid({ campaignId, adId, bidPercentage });

  return {
    listingId,
    bidPercentage,
    adStatus: existing?.adStatus ?? null,
    adId,
    campaignId,
    campaignName: existing?.campaignName ?? null,
    fundingModel: existing?.fundingModel ?? null,
  };
}

function isActiveCampaignStatus(status: string | undefined): boolean {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized === "RUNNING" ||
    normalized === "ACTIVE" ||
    normalized === "PENDING" ||
    normalized === "SCHEDULED"
  );
}

async function fetchAllCampaigns(marketplaceId: string): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  let offset = 0;

  while (true) {
    const data = await ebayMarketingFetch<CampaignsResponse>(
      `/ad_campaign?marketplace_id=${encodeURIComponent(marketplaceId)}&limit=100&offset=${offset}`,
    );
    const batch = data.campaigns ?? [];
    campaigns.push(...batch);

    if (batch.length < 100) {
      break;
    }

    offset += 100;
    await sleep(100);
  }

  return campaigns;
}

async function fetchCampaignAds(
  campaignId: string,
  listingIds?: string[],
): Promise<Ad[]> {
  const ads: Ad[] = [];
  let offset = 0;
  const listingFilter =
    listingIds?.length
      ? `&listing_ids=${listingIds.map(encodeURIComponent).join(",")}`
      : "";

  for (let page = 0; page < MAX_AD_PAGES_PER_CAMPAIGN; page += 1) {
    const data = await ebayMarketingFetch<AdsResponse>(
      `/ad_campaign/${encodeURIComponent(campaignId)}/ad?limit=${AD_PAGE_SIZE}&offset=${offset}${listingFilter}`,
    );
    const batch = data.ads ?? [];
    ads.push(...batch);

    if (batch.length < AD_PAGE_SIZE) {
      break;
    }

    // When filtering to a few listing IDs, one page is usually enough.
    if (listingIds?.length && listingIds.length <= AD_PAGE_SIZE) {
      break;
    }

    offset += AD_PAGE_SIZE;
    await sleep(100);
  }

  return ads;
}

/**
 * Load current Promoted Listings ad rates (bidPercentage) keyed by listing ID.
 */
export async function fetchEbayPromoRatesByListingId(options?: {
  listingIds?: string[];
}): Promise<EbayPromoRatesResult> {
  const { marketplaceId } = getEbayConfig();
  const ratesByListingId: Record<string, EbayListingPromoRate> = {};
  const listingIds = options?.listingIds
    ?.map((id) => id.trim())
    .filter(Boolean);

  try {
    const campaigns = await fetchAllCampaigns(marketplaceId);
    const activeCampaigns = campaigns.filter((campaign) =>
      isActiveCampaignStatus(campaign.campaignStatus),
    );

    let adsScanned = 0;

    for (const campaign of activeCampaigns) {
      const campaignId = campaign.campaignId?.trim();
      if (!campaignId) {
        continue;
      }

      const ads = await fetchCampaignAds(campaignId, listingIds);
      adsScanned += ads.length;

      for (const ad of ads) {
        const listingId = ad.listingId?.trim();
        if (!listingId) {
          continue;
        }

        if (listingIds?.length && !listingIds.includes(listingId)) {
          continue;
        }

        const nextRate: EbayListingPromoRate = {
          listingId,
          bidPercentage: parseBidPercentage(ad.bidPercentage),
          adStatus: ad.adStatus?.trim() || null,
          adId: ad.adId?.trim() || null,
          campaignId,
          campaignName: campaign.campaignName?.trim() || null,
          fundingModel: campaign.fundingStrategy?.fundingModel?.trim() || null,
        };

        const existing = ratesByListingId[listingId];
        // Prefer ACTIVE ads; otherwise keep the first / higher rate seen.
        if (!existing) {
          ratesByListingId[listingId] = nextRate;
          continue;
        }

        const existingActive = existing.adStatus?.toUpperCase() === "ACTIVE";
        const nextActive = nextRate.adStatus?.toUpperCase() === "ACTIVE";
        if (!existingActive && nextActive) {
          ratesByListingId[listingId] = nextRate;
          continue;
        }

        if (
          (existing.bidPercentage == null && nextRate.bidPercentage != null) ||
          ((existing.bidPercentage ?? 0) < (nextRate.bidPercentage ?? 0) &&
            (!existingActive || nextActive))
        ) {
          ratesByListingId[listingId] = nextRate;
        }
      }
    }

    return {
      ratesByListingId,
      campaignsScanned: activeCampaigns.length,
      adsScanned,
      warning: null,
    };
  } catch (error) {
    if (error instanceof EbayApiError) {
      const needsReconnect =
        error.status === 403 &&
        (error.body?.includes("scope") ||
          error.body?.includes("Access denied") ||
          error.body?.includes("Insufficient"));

      return {
        ratesByListingId: {},
        campaignsScanned: 0,
        adsScanned: 0,
        warning: needsReconnect
          ? "Promoted Listings need sell.marketing (or sell.marketing.readonly to view). Reconnect eBay in Settings to grant scopes."
          : `Could not load promo rates: ${error.message}`,
      };
    }

    return {
      ratesByListingId: {},
      campaignsScanned: 0,
      adsScanned: 0,
      warning:
        error instanceof Error
          ? `Could not load promo rates: ${error.message}`
          : "Could not load promo rates.",
    };
  }
}
