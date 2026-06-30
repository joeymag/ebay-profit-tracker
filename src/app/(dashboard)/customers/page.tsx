import { CustomersTable } from "@/components/customers/customers-table";
import { CustomerSearchFilterBar } from "@/components/filters/customer-search-filter-bar";
import { DateRangeFilterBar } from "@/components/filters/date-range-filter-bar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  aggregateCustomers,
  filterCustomersBySearch,
} from "@/lib/orders/customers";
import { getStoredOrdersForRange } from "@/lib/orders/filtered-orders";

export const dynamic = "force-dynamic";

type CustomersPageProps = {
  searchParams: Promise<{ range?: string; q?: string }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() ?? "";
  const { orders, range, rangeLabel, totalOrders } =
    await getStoredOrdersForRange(params);
  const allCustomers = aggregateCustomers(orders);
  const customers = filterCustomersBySearch(allCustomers, orders, searchQuery);
  const repeatCustomers = customers.filter((c) => c.isRepeatCustomer).length;
  const countHint =
    orders.length !== totalOrders
      ? `${customers.length} buyers · ${rangeLabel} (${orders.length} orders)`
      : `${customers.length} buyers · ${rangeLabel}`;

  return (
    <>
      <DashboardHeader
        title="Customers"
        description={`${countHint} · ${repeatCustomers} repeat in period${searchQuery ? ` · matching “${searchQuery}”` : ""}`}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 md:p-10">
        <div className="surface-card flex flex-col gap-4 p-5">
          <p className="text-sm text-muted-foreground">
            Buyers with at least one order in the selected period. Totals reflect
            orders in that range only.
          </p>
          <DateRangeFilterBar />
          <CustomerSearchFilterBar />
        </div>

        <Card className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle>
              {customers.length > 0
                ? searchQuery
                  ? `${customers.length} matching customers`
                  : `${customers.length} customers`
                : searchQuery
                  ? "No matching customers"
                  : "No customers in this period"}
            </CardTitle>
            <CardDescription>
              eBay buyers are matched by username. Amazon and other orders use
              the buyer name. Click a customer to see their orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0">
            <div className="overflow-x-auto">
              <CustomersTable
                customers={customers}
                range={range}
                searchQuery={searchQuery}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}