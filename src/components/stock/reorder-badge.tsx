import { Badge } from "@/components/ui/badge";
import type { StockSalesInsight } from "@/lib/orders/sku-units-sold";

const toneStyles = {
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
  consider: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  quiet: "border-border/60 bg-muted/30 text-muted-foreground",
  none: "border-border/60 bg-muted/20 text-muted-foreground",
} as const;

export function ReorderBadge({ sales }: { sales: Pick<StockSalesInsight, "reorderLabel" | "reorderTone"> }) {
  if (sales.reorderTone === "none") {
    return null;
  }

  return (
    <Badge variant="outline" className={toneStyles[sales.reorderTone]}>
      {sales.reorderLabel}
    </Badge>
  );
}
