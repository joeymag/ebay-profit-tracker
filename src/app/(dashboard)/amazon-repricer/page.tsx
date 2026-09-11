import { AmazonRepricerPanel } from "@/components/amazon-repricer/amazon-repricer-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AmazonRepricerPage() {
  return (
    <>
      <DashboardHeader
        title="Amazon repricer"
        description="Rule-based pricing against Buy Box and lowest offers"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonRepricerPanel />
      </div>
    </>
  );
}
