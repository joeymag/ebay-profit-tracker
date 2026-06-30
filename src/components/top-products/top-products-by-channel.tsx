import { LineItemImage } from "@/components/orders/line-item-image";
import { MoneyCell } from "@/components/orders/money-cell";
import { SalesChannelBadge } from "@/components/orders/sales-channel-badge";
import { Badge } from "@/components/ui/badge";
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
import type { ChannelTopProducts } from "@/lib/orders/top-products";

type TopProductsByChannelProps = {
  sections: ChannelTopProducts[];
  currency: string;
  rangeLabel: string;
};

export function TopProductsByChannel({
  sections,
  currency,
  rangeLabel,
}: TopProductsByChannelProps) {
  const activeSections = sections.filter((section) => section.products.length > 0);

  if (!activeSections.length) {
    return (
      <Card className="surface-card">
        <CardHeader>
          <CardTitle>No product sales in this period</CardTitle>
          <CardDescription>
            Try a wider date range or sync orders from Shopify.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {activeSections.map((section) => (
        <Card key={section.channel} className="surface-card overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <SalesChannelBadge
                  tags={section.channel}
                  channel={section.channel}
                />
                <CardTitle className="text-xl">Top products</CardTitle>
                <CardDescription>
                  {rangeLabel} · ranked by revenue
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Channel revenue</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(section.totalRevenue, currency)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Channel profit</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {section.ordersWithProfit > 0 ? (
                      formatMoney(section.totalProfit, currency)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Units sold</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {section.totalUnits}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0 pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-6">#</TableHead>
                    <TableHead className="w-16" />
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="pr-6 text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.products.map((product, index) => (
                    <TableRow
                      key={product.productKey}
                      className={
                        index % 2 === 0
                          ? "border-border/40 bg-muted/15"
                          : "border-border/40"
                      }
                    >
                      <TableCell className="pl-6 tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <LineItemImage
                          src={product.imageUrl}
                          alt={product.title}
                        />
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="font-medium leading-snug">{product.title}</p>
                        {product.sku ? (
                          <Badge
                            variant="outline"
                            className="mt-1.5 font-mono text-xs font-medium"
                          >
                            {product.sku}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {product.unitsSold}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {product.orderCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyCell amount={product.revenue} currency={currency} />
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {product.ordersWithProfit > 0 ? (
                          <MoneyCell
                            amount={product.profit}
                            currency={currency}
                            emphasize
                          />
                        ) : (
                          <span
                            className="text-muted-foreground"
                            title="Add product cost and postage to calculate profit"
                          >
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
