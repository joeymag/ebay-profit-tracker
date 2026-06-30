import { AmazonFeeCalculatorPanel } from "@/components/amazon-calculator/amazon-fee-calculator";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AmazonFeeCalculatorPage() {
  return (
    <>
      <DashboardHeader
        title="Amazon fee calculator"
        description="Work out profit per item before you list — uses the same fee rules as your Amazon orders"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonFeeCalculatorPanel />
      </div>
    </>
  );
}
