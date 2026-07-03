import { Badge } from "@/components/ui/badge";
import type { StockSalesInsight } from "@/lib/orders/sku-units-sold";

type StockReorderInsightProps = {
  available: number;
  sales: StockSalesInsight;
};

const toneStyles = {
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
  consider: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  quiet: "border-border/60 bg-muted/30 text-muted-foreground",
  none: "border-primary/30 bg-primary/10 text-primary",
} as const;

export function StockReorderInsight({ available, sales }: StockReorderInsightProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Should you reorder?</p>
        <Badge variant="outline" className={toneStyles[sales.reorderTone]}>
          {sales.reorderLabel}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="In stock now" value={String(available)} emphasize={available === 0} />
        <Stat label="Sold last 30 days" value={String(sales.unitsSold30Days)} />
        <Stat label="Sold last 90 days" value={String(sales.unitsSold90Days)} />
        <Stat
          label="Sold all time"
          value={String(sales.unitsSold)}
          hint={`${sales.orderCount} orders`}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Use recent sales vs current stock to decide how many units to buy. Items with
        sales in the last 30 days but zero stock are usually worth restocking first.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasize = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          emphasize
            ? "text-2xl font-semibold tabular-nums text-destructive"
            : "text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
