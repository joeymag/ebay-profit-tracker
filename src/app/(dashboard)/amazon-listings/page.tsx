import { AmazonListingsPanel } from "@/components/amazon-listings/amazon-listings-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function AmazonListingsPage() {
  return (
    <>
      <DashboardHeader
        title="Amazon listings"
        description="Open listings, cost of goods, and postage used for order profit"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonListingsPanel />
      </div>
    </>
  );
}
