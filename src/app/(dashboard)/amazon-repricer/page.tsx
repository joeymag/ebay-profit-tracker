import { AmazonRepricerPanel } from "@/components/amazon-repricer/amazon-repricer-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AmazonRepricerPage() {
  return (
    <>
      <DashboardHeader
        title="Amazon repricer"
        description="Separate Standard and Amazon Business prices — attack both Buy Boxes"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonRepricerPanel />
      </div>
    </>
  );
}
