import { CircleDollarSign, Megaphone, Package, PiggyBank, Receipt } from "lucide-react";

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
  const {
    currency,
    revenue,
    profit,
    ordersWithProfit,
    ordersMissingProductCost,
    ebaySellingFees,
    ebayAdsFees,
    ebayOrders,
    ebayOrdersWithAdsFee,
    ebayOrdersWithActualFees,
  } = summary;

  const profitHint =
    ordersWithProfit < orderCount
      ? `Profit only counts ${ordersWithProfit} of ${orderCount} order(s) with all costs entered`
      : summary.amazonSubscription
        ? "After costs & Amazon subscription"
        : "Revenue minus product, postage & platform fees";

  const ebayFeesHint =
    ebayOrdersWithActualFees > 0
      ? `Actual fees from eBay · ${ebayOrdersWithActualFees} of ${ebayOrders} eBay orders · ${filterSummary}`
      : `${ebayOrders} eBay order(s) · sync fees from Settings`;

  const ebayAdsHint =
    ebayOrdersWithAdsFee > 0
      ? `Ads fees incl. VAT · ${ebayOrdersWithAdsFee} of ${ebayOrders} eBay orders · ${filterSummary}`
      : `${ebayOrders} eBay order(s) · sync fees from Settings`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
      {ebayOrders > 0 ? (
        <>
          <StatCard
            label="eBay fees"
            value={
              ebaySellingFees > 0
                ? formatMoney(ebaySellingFees, currency)
                : "—"
            }
            hint={ebayFeesHint}
            icon={Receipt}
            accent="cost"
          />
          <StatCard
            label="eBay ads fees"
            value={
              ebayAdsFees > 0 ? formatMoney(ebayAdsFees, currency) : "—"
            }
            hint={ebayAdsHint}
            icon={Megaphone}
            accent="cost"
          />
        </>
      ) : null}
      <StatCard
        label="Costs complete"
        value={orderCount ? `${ordersWithFullCosts} / ${orderCount}` : "—"}
        hint={
          ordersMissingProductCost > 0
            ? "Red rows still need product cost, postage, or eBay fees (sync from Settings)"
            : "All filtered orders have costs entered"
        }
        icon={Package}
        accent="orders"
      />
    </div>
  );
}
