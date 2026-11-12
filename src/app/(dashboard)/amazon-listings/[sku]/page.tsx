import { AmazonListingEditor } from "@/components/amazon-listings/amazon-listing-editor";
import { DashboardHeader } from "@/components/layout/dashboard-header";

type AmazonListingEditPageProps = {
  params: Promise<{ sku: string }>;
};

export default async function AmazonListingEditPage({
  params,
}: AmazonListingEditPageProps) {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku || "").trim();

  return (
    <>
      <DashboardHeader
        title="Edit Amazon listing"
        description="Edit from the Supabase cache. Refresh pulls live Amazon data into the cache; Save patches Amazon and updates the cache."
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <AmazonListingEditor sku={sku} />
      </div>
    </>
  );
}
