import { DashboardHeader } from "@/components/layout/dashboard-header";
import { InventoryMapClient } from "@/components/inventory-map/inventory-map-client";

export default function InventoryMapPage() {
  return (
    <>
      <DashboardHeader
        title="Inventory map"
        description="Browse all tracked Shopify stock levels, SKUs, and recent sales"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <InventoryMapClient />
      </div>
    </>
  );
}
