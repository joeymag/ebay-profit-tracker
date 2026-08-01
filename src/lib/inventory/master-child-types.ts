export type InventoryMaster = {
  sku: string;
  packSize: number;
  piecesOnHand: number;
  label: string | null;
  updatedAt: string;
};

export type InventoryChildMapping = {
  childSku: string;
  masterSku: string;
  piecesPerUnit: number;
  label: string | null;
  updatedAt: string;
};

export type InventoryMasterWithChildren = InventoryMaster & {
  children: InventoryChildMapping[];
};

/** Sellable child units from master piece pool. */
export function childSellableUnits(
  piecesOnHand: number,
  piecesPerUnit: number,
): number {
  if (piecesPerUnit <= 0) {
    return 0;
  }
  return Math.floor(piecesOnHand / piecesPerUnit);
}
