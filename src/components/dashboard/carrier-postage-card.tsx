import { MoneyCell } from "@/components/orders/money-cell";
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
import {
  carrierStyles,
  type CarrierPostageStats,
} from "@/lib/orders/carrier-stats";
import { cn } from "@/lib/utils";

type CarrierPostageCardProps = {
  stats: CarrierPostageStats[];
  currency: string;
  rangeLabel: string;
};

export function CarrierPostageCard({
  stats,
  currency,
  rangeLabel,
}: CarrierPostageCardProps) {
  const totalParcels = stats.reduce((sum, row) => sum + row.parcels, 0);
  const totalSpend = stats.reduce((sum, row) => sum + row.spend, 0);
  const featured = stats.filter(
    (row) => row.carrier === "Royal Mail" || row.carrier === "Evri",
  );

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle>Parcels by carrier</CardTitle>
        <CardDescription>
          Royal Mail vs Evri parcels and postage spend · {rangeLabel.toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["Royal Mail", "Evri"] as const).map((carrier) => {
            const row = featured.find((s) => s.carrier === carrier) ?? {
              carrier,
              parcels: 0,
              spend: 0,
              ordersWithCost: 0,
              avgSpend: null as number | null,
            };
            return (
              <div
                key={carrier}
                className="rounded-xl border border-border/60 bg-muted/20 p-4"
              >
                <Badge
                  variant="outline"
                  className={cn(carrierStyles[carrier].badge)}
                >
                  {carrier}
                </Badge>
                <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                  {row.parcels}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  parcel{row.parcels === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-sm font-medium tabular-nums">
                  {row.spend > 0 ? formatMoney(row.spend, currency) : "—"}
                  <span className="ml-1 font-normal text-muted-foreground">
                    spent
                    {row.avgSpend != null
                      ? ` · avg ${formatMoney(row.avgSpend, currency)}`
                      : ""}
                  </span>
                </p>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Carrier</TableHead>
                <TableHead className="text-right">Parcels</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="pr-6 text-right">Avg / parcel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No shipped parcels with carrier data in this period.
                  </TableCell>
                </TableRow>
              ) : (
                stats.map((row, index) => (
                  <TableRow
                    key={row.carrier}
                    className={
                      index % 2 === 0 ? "border-border/40 bg-muted/15" : undefined
                    }
                  >
                    <TableCell className="pl-6">
                      <Badge
                        variant="outline"
                        className={cn(carrierStyles[row.carrier].badge)}
                      >
                        {row.carrier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.parcels}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.spend > 0 ? (
                        <MoneyCell amount={row.spend} currency={currency} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      {row.avgSpend != null ? (
                        <MoneyCell amount={row.avgSpend} currency={currency} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
              {stats.length > 0 ? (
                <TableRow className="border-t bg-muted/30 font-medium">
                  <TableCell className="pl-6">Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalParcels}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalSpend > 0 ? (
                      <MoneyCell amount={totalSpend} currency={currency} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
