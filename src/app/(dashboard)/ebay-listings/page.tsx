import { ActiveEbayListingsPanel } from "@/components/ebay-listings/active-listings-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default function EbayListingsPage() {
  return (
    <>
      <DashboardHeader
        title="Active eBay listings"
        description="Live published listings from your connected eBay account"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <ActiveEbayListingsPanel />
      </div>
    </>
  );
}
