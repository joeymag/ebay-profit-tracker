import { ListingVariationsPanel } from "@/components/ebay-listings/listing-variations-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

type EbayListingDetailPageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function EbayListingDetailPage({
  params,
}: EbayListingDetailPageProps) {
  const { listingId } = await params;

  return (
    <>
      <DashboardHeader
        title="Listing variations"
        description={`SKU, stock, and prices for listing ${listingId}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <ListingVariationsPanel listingId={listingId} />
      </div>
    </>
  );
}
