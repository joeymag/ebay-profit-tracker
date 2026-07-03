import { ListingTitleExperimentPanel } from "@/components/ebay-analytics/listing-title-experiment-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

type ListingExperimentPageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function ListingExperimentPage({
  params,
}: ListingExperimentPageProps) {
  const { listingId } = await params;

  return (
    <>
      <DashboardHeader
        title="Title experiment"
        description={`Track whether keyword changes improve sales for listing ${listingId}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <ListingTitleExperimentPanel listingId={listingId} />
      </div>
    </>
  );
}
