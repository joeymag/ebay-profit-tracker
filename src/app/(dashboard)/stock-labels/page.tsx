import { StockLabelPanel } from "@/components/labels/stock-label-panel";
import { DashboardHeader } from "@/components/layout/dashboard-header";

type StockLabelsPageProps = {
  searchParams: Promise<{ sku?: string }>;
};

export default async function StockLabelsPage({
  searchParams,
}: StockLabelsPageProps) {
  const params = await searchParams;

  return (
    <>
      <DashboardHeader
        title="Stock labels"
        description="Print 4×6 stickers with the item name and a scannable barcode"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <StockLabelPanel initialSku={params.sku?.trim() ?? ""} />
      </div>
    </>
  );
}
