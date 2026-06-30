import { CircleDollarSign, PiggyBank, Package } from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { formatMoney } from "@/lib/format";
import type { summarizeOrders } from "@/lib/orders/filtered-orders";

type OrdersFilterSummaryProps = {
  orderCount: number;
  ordersWithFullCosts: number;
  summary: ReturnType<typeof summarizeOrders>;
  profitLabel: string;
  filterSummary: string;
};

export function OrdersFilterSummary({
  orderCount,
  ordersWithFullCosts,
  summary,
  profitLabel,
  filterSummary,
}: OrdersFilterSummaryProps) {
  const { currency, revenue, profit, ordersWithProfit, ordersMissingProductCost } =
    summary;

  const profitHint =
    ordersWithProfit < orderCount
      ? `Profit only counts ${ordersWithProfit} order(s) with all costs entered`
      : summary.amazonSubscription
        ? "After costs & Amazon subscription"
        : "Revenue minus product, postage & platform fees";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Revenue"
        value={orderCount ? formatMoney(revenue, currency) : "—"}
        hint={`${orderCount} order(s) · ${filterSummary}`}
        icon={CircleDollarSign}
        accent="revenue"
      />
      <StatCard
        label={profitLabel}
        value={
          ordersWithProfit > 0 ? formatMoney(profit, currency) : "—"
        }
        hint={profitHint}
        icon={PiggyBank}
        accent="profit"
      />
      <StatCard
        label="Costs complete"
        value={orderCount ? `${ordersWithFullCosts} / ${orderCount}` : "—"}
        hint={
          ordersMissingProductCost > 0
            ? "Red rows still need product cost, postage, or eBay fee"
            : "All filtered orders have costs entered"
        }
        icon={Package}
        accent="orders"
      />
    </div>
  );
}
