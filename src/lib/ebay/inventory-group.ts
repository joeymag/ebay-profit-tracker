import {
  ebayInventoryFetch,
  updateInventoryItemTitle,
} from "@/lib/ebay/inventory-client";
import { EbayApiError } from "@/lib/ebay/errors";

type InventoryItemSummary = {
  groupIds?: string[];
};

type InventoryItemGroupRecord = Record<string, unknown> & {
  variantSKUs?: string[];
  title?: string;
};

export type ResolvedInventoryGroup = {
  groupKey: string;
  memberSkus: string[];
};

function inventoryErrorMessage(error: unknown): string {
  if (error instanceof EbayApiError) {
    return error.body?.slice(0, 400) ?? error.message;
  }

  return error instanceof Error ? error.message : "Could not update title on eBay";
}

export async function resolveInventoryGroupFromMemberSku(
  memberSku: string,
): Promise<ResolvedInventoryGroup | null> {
  const sku = memberSku.trim();
  if (!sku) {
    return null;
  }

  const item = await ebayInventoryFetch<InventoryItemSummary>(
    `/inventory_item/${encodeURIComponent(sku)}`,
  );
  const groupKey = item.groupIds?.[0]?.trim();
  if (!groupKey) {
    return null;
  }

  const group = await ebayInventoryFetch<InventoryItemGroupRecord>(
    `/inventory_item_group/${encodeURIComponent(groupKey)}`,
  );

  const memberSkus = (group.variantSKUs ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    groupKey,
    memberSkus: memberSkus.length ? memberSkus : [sku],
  };
}

function prepareInventoryGroupPayload(
  group: InventoryItemGroupRecord,
  title: string,
): InventoryItemGroupRecord {
  const payload: InventoryItemGroupRecord = {
    ...group,
    title: title.trim(),
  };

  delete payload.inventoryItemGroupKey;
  return payload;
}

async function syncMemberInventoryTitles(
  memberSkus: string[],
  title: string,
): Promise<string | null> {
  const failures: string[] = [];

  for (const sku of memberSkus) {
    const result = await updateInventoryItemTitle(sku, title);
    if (!result.ok) {
      failures.push(`${sku}: ${result.error}`);
    }
  }

  if (!failures.length) {
    return null;
  }

  return failures.slice(0, 3).join(" · ");
}

export async function updateInventoryItemGroupTitle(
  groupKey: string,
  title: string,
): Promise<{ ok: true; memberSkus: string[] } | { ok: false; error: string }> {
  try {
    const normalizedKey = groupKey.trim();
    const existing = await ebayInventoryFetch<InventoryItemGroupRecord>(
      `/inventory_item_group/${encodeURIComponent(normalizedKey)}`,
    );
    const memberSkus = (existing.variantSKUs ?? [])
      .map((value) => value.trim())
      .filter(Boolean);

    if (!memberSkus.length) {
      return {
        ok: false,
        error: "Inventory item group has no variant SKUs.",
      };
    }

    await ebayInventoryFetch(
      `/inventory_item_group/${encodeURIComponent(normalizedKey)}`,
      {
        method: "PUT",
        body: JSON.stringify(prepareInventoryGroupPayload(existing, title)),
      },
    );

    const memberSyncError = await syncMemberInventoryTitles(memberSkus, title);
    if (memberSyncError) {
      return {
        ok: false,
        error: `Group title updated but some variation SKUs failed: ${memberSyncError}`,
      };
    }

    return { ok: true, memberSkus };
  } catch (error) {
    return { ok: false, error: inventoryErrorMessage(error) };
  }
}

export async function updateEbayListingTitle(input: {
  title: string;
  sku?: string | null;
  memberSkus?: string[];
  isItemGroup?: boolean;
}): Promise<{
  appliedToEbay: boolean;
  ebayUpdateError: string | null;
  inventoryItemGroupKey: string | null;
}> {
  const title = input.title.trim();
  const memberSkus = [...new Set((input.memberSkus ?? []).map((sku) => sku.trim()).filter(Boolean))];
  const primarySku = input.sku?.trim() || memberSkus[0] || null;

  if (input.isItemGroup && primarySku) {
    const resolved = await resolveInventoryGroupFromMemberSku(primarySku);
    if (!resolved) {
      return {
        appliedToEbay: false,
        ebayUpdateError:
          "Could not find the eBay inventory item group for this listing. Reconnect eBay with sell.inventory scope.",
        inventoryItemGroupKey: null,
      };
    }

    const result = await updateInventoryItemGroupTitle(resolved.groupKey, title);
    return {
      appliedToEbay: result.ok,
      ebayUpdateError: result.ok ? null : result.error,
      inventoryItemGroupKey: resolved.groupKey,
    };
  }

  if (primarySku) {
    const result = await updateInventoryItemTitle(primarySku, title);
    return {
      appliedToEbay: result.ok,
      ebayUpdateError: result.ok ? null : result.error,
      inventoryItemGroupKey: null,
    };
  }

  return {
    appliedToEbay: false,
    ebayUpdateError:
      "No SKU linked to this listing — title saved for tracking only.",
    inventoryItemGroupKey: null,
  };
}
