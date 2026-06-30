import { MoneyCell } from "@/components/orders/money-cell";
import { SalesChannelBadge } from "@/components/orders/sales-channel-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import {
  channelStyles,
  type ChannelStats,
} from "@/lib/orders/channel";

type ChannelProfitCardProps = {
  stats: ChannelStats[];
  currency: string;
  totalProfit: number;
};

function CostCell({
  amount,
  currency,
  tracked,
  total,
}: {
  amount: number;
  currency: string;
  tracked: number;
  total: number;
}) {
  if (amount > 0) {
    return <MoneyCell amount={amount} currency={currency} />;
  }
  if (tracked === 0) {
    return (
      <span className="text-muted-foreground" title="No cost data for orders in this channel">
        —
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export function ChannelProfitCard({
  stats,
  currency,
  totalProfit,
}: ChannelProfitCardProps) {
  const activeChannels = stats.filter((s) => s.orders > 0);

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Profit by sales channel</CardTitle>
        <CardDescription>
          Revenue, costs, and profit by channel from order tags — updates with
          your date filter
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {activeChannels
            .filter((s) => s.channel !== "Other")
            .map((row) => (
              <div
                key={row.channel}
                className="rounded-xl border border-border/60 bg-muted/20 p-4"
              >
                <SalesChannelBadge tags={row.channel} channel={row.channel} />
                <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                  {row.ordersWithProfit > 0 ? (
                    formatMoney(row.profit, currency)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.orders} orders · {formatMoney(row.revenue, currency)} revenue
                </p>
                {row.ordersWithProfit > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Costs: {formatMoney(row.totalCost, currency)} (
                    {formatMoney(row.productCost, currency)} product ·{" "}
                    {formatMoney(row.postageCost, currency)} postage
                    {row.platformFee > 0
                      ? ` · ${formatMoney(row.platformFee, currency)} Amazon fee`
                      : ""}
                    )
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    No cost data — set product costs or sync postage
                  </p>
                )}
              </div>
            ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Channel</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Product</TableHead>
                <TableHead className="text-right">Postage</TableHead>
                <TableHead className="text-right">Amazon fee</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
                <TableHead className="pr-6 text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeChannels.map((row, i) => {
                const share =
                  totalProfit > 0 ? (row.profit / totalProfit) * 100 : 0;

                return (
                  <TableRow
                    key={row.channel}
                    className={
                      i % 2 === 0 ? "border-border/40 bg-muted/15" : undefined
                    }
                  >
                    <TableCell className="pl-6">
                      <div className="flex min-w-[10rem] flex-col gap-2">
                        <SalesChannelBadge tags={row.channel} channel={row.channel} />
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${channelStyles[row.channel].bar}`}
                            style={{
                              width: `${Math.max(share, row.profit > 0 ? 4 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.orders}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell amount={row.revenue} currency={currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CostCell
                        amount={row.productCost}
                        currency={currency}
                        tracked={row.ordersWithProductCost}
                        total={row.orders}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CostCell
                        amount={row.postageCost}
                        currency={currency}
                        tracked={row.ordersWithPostage}
                        total={row.orders}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CostCell
                        amount={row.platformFee}
                        currency={currency}
                        tracked={row.platformFee > 0 ? row.orders : 0}
                        total={row.orders}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <CostCell
                        amount={row.totalCost}
                        currency={currency}
                        tracked={row.ordersWithProfit}
                        total={row.orders}
                      />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {row.ordersWithProfit > 0 ? (
                        <MoneyCell
                          amount={row.profit}
                          currency={currency}
                          emphasize
                        />
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title={`${row.orders} order(s) — revenue ${formatMoney(row.revenue, currency)} but no product or postage costs recorded`}
                        >
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
