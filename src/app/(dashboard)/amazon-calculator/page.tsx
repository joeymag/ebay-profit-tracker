import { AmazonFeeCalculatorPanel } from "@/components/amazon-calculator/amazon-fee-calculator";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AmazonFeeCalculatorPage() {
  return (
    <>
      <DashboardHeader
        title="Amazon fee calculator"
        description="Work out profit per item before you list — switch between Fulfilment by Merchant and Fulfilment by Amazon"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonFeeCalculatorPanel />
      </div>
    </>
  );
}
