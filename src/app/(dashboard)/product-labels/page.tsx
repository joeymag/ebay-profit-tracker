import { ProductBagLabelPanel } from "@/components/labels/product-bag-label-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

type ProductLabelsPageProps = {
  searchParams: Promise<{ sku?: string }>;
};

export default async function ProductLabelsPage({
  searchParams,
}: ProductLabelsPageProps) {
  const params = await searchParams;

  return (
    <>
      <DashboardHeader
        title="Bag labels"
        description="Print 4×6 stickers for product bags with logo, name, cut line, and QR code"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <ProductBagLabelPanel initialSku={params.sku?.trim() ?? ""} />
      </div>
    </>
  );
}
