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
import type { LocationStat } from "@/lib/orders/locations";

type OrderLocationsCardProps = {
  locations: LocationStat[];
  currency: string;
  ordersWithAddress: number;
  geocodedOrders: number;
  totalOrders: number;
  rangeLabel: string;
};

export function OrderLocationsCard({
  locations,
  currency,
  ordersWithAddress,
  geocodedOrders,
  totalOrders,
  rangeLabel,
}: OrderLocationsCardProps) {
  const topLocations = locations.slice(0, 10);

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Order locations</CardTitle>
        <CardDescription>
          {rangeLabel} · {ordersWithAddress} of {totalOrders} orders with an
          address · {geocodedOrders} geocoded
        </CardDescription>
      </CardHeader>
      <CardContent>
        {topLocations.length ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topLocations.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.orders}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.sharePercent.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.revenue, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-base text-muted-foreground">
            Sync orders from Shopify to import shipping addresses and map where
            your sales come from.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
