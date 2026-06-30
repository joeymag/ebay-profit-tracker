import { notFound } from "next/navigation";

import { CustomerDetailView } from "@/components/customers/customer-detail-view";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { filterOrdersByDateRange, getDateRangeLabel, parseDateRange } from "@/lib/date-range";
import { getCustomerDetail } from "@/lib/orders/customers";
import { getStoredOrders } from "@/lib/orders/store";

export const dynamic = "force-dynamic";

type CustomerDetailPageProps = {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ range?: string; q?: string }>;
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { customerId } = await params;
  const query = await searchParams;
  const range = parseDateRange(query.range);
  const { orders } = await getStoredOrders();
  const ordersForRange = filterOrdersByDateRange(orders, range);
  const customer = getCustomerDetail(ordersForRange, customerId);

  if (!customer) {
    notFound();
  }

  const rangeLabel = getDateRangeLabel(range);
  const rangeActive = range !== "30days" && range !== "all";

  return (
    <>
      <DashboardHeader
        title={customer.displayName}
        description={
          customer.ebayUsername
            ? `eBay: ${customer.ebayUsername} · ${customer.orderCount} order${customer.orderCount === 1 ? "" : "s"}${rangeActive ? ` · ${rangeLabel}` : ""}`
            : `${customer.orderCount} order${customer.orderCount === 1 ? "" : "s"}${rangeActive ? ` · ${rangeLabel}` : ""}`
        }
      />
      <CustomerDetailView
        customer={customer}
        range={range}
        searchQuery={query.q?.trim()}
      />
    </>
  );
}
