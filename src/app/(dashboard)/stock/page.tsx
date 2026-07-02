import { DashboardHeader } from "@/components/layout/dashboard-header";
import { StockControlClient } from "@/components/stock/stock-control-client";

export default function StockControlPage() {
  return (
    <>
      <DashboardHeader
        title="Stock control"
        description="Scan a SKU and update available quantity in Shopify"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <StockControlClient />
      </div>
    </>
  );
}
