import { DashboardHeader } from "@/components/layout/dashboard-header";
import { EbayFeeCalculatorPanel } from "@/components/ebay-calculator/ebay-fee-calculator";

export default function EbayFeeCalculatorPage() {
  return (
    <>
      <DashboardHeader
        title="eBay fee calculator"
        description="Work out profit per item before you list — uses the same fee and VAT rules as your orders"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <EbayFeeCalculatorPanel />
      </div>
    </>
  );
}
