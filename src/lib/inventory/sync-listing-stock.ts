import { childSellableUnits } from "@/lib/inventory/master-child-types";
import {
  getChildMappingBySku,
  listInventoryMasters,
  syncMasterPiecesFromShopify,
} from "@/lib/inventory/master-child";
import { updateStockQuantity } from "@/lib/shopify/inventory";

export type ListingStockPushResult = {
  childSku: string;
  sellable: number;
  pushed: number;
};

/** Push sellable units (from master piece pool) to a child SKU on Shopify. */
export async function pushChildListingStockToShopify(
  childSku: string,
): Promise<ListingStockPushResult> {
  const link = await getChildMappingBySku(childSku);
  if (!link) {
    throw new Error(`Child SKU "${childSku}" is not mapped to a master.`);
  }

  const sellable = childSellableUnits(
    link.master.piecesOnHand,
    link.piecesPerUnit,
  );

  if (
    link.childSku.trim().toLowerCase() === link.master.sku.trim().toLowerCase()
  ) {
    return {
      childSku: childSku.trim(),
      sellable,
      pushed: sellable,
    };
  }

  const result = await updateStockQuantity({
    sku: childSku.trim(),
    available: sellable,
  });

  return {
    childSku: childSku.trim(),
    sellable,
    pushed: result.available,
  };
}

/** Refresh masters from Shopify, then push sellable counts to child listings. */
export async function syncConfigListingStock(input: {
  masterSkus: string[];
  childSkus: string[];
}): Promise<ListingStockPushResult[]> {
  const masterSkus = [...new Set(input.masterSkus.map((sku) => sku.trim()).filter(Boolean))];
  const childSkus = [...new Set(input.childSkus.map((sku) => sku.trim()).filter(Boolean))];

  for (const masterSku of masterSkus) {
    await syncMasterPiecesFromShopify(masterSku);
  }

  const pushed: ListingStockPushResult[] = [];
  for (const childSku of childSkus) {
    pushed.push(await pushChildListingStockToShopify(childSku));
  }

  return pushed;
}

/** After a manual stock edit, refresh master pool + child listing quantities for that SKU. */
export async function refreshConfigStockForSku(
  sku: string,
): Promise<ListingStockPushResult[]> {
  const trimmed = sku.trim();
  if (!trimmed) {
    return [];
  }

  const masters = await listInventoryMasters();
  const master = masters.find(
    (entry) => entry.sku.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (master) {
    await syncMasterPiecesFromShopify(master.sku);
    const childSkus = master.children
      .map((child) => child.childSku)
      .filter(
        (childSku) =>
          childSku.trim().toLowerCase() !== master.sku.trim().toLowerCase(),
      );
    return syncConfigListingStock({
      masterSkus: [master.sku],
      childSkus,
    });
  }

  const childLink = await getChildMappingBySku(trimmed);
  if (!childLink) {
    return [];
  }

  const linkedMaster = masters.find(
    (entry) =>
      entry.sku.trim().toLowerCase() ===
      childLink.master.sku.trim().toLowerCase(),
  );
  const childSkus =
    linkedMaster?.children.map((child) => child.childSku) ?? [trimmed];

  return syncConfigListingStock({
    masterSkus: [childLink.master.sku],
    childSkus,
  });
}
