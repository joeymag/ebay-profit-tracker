import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type MissingValueCellProps = {
  missing: boolean;
  notApplicable?: boolean;
  children: React.ReactNode;
};

export function MissingValueCell({
  missing,
  notApplicable,
  children,
}: MissingValueCellProps) {
  return (
    <span
      className={cn(
        missing && !notApplicable && "font-medium text-destructive",
        notApplicable && "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ProductCostCell({
  amount,
  currency,
  missing,
}: {
  amount: number | null;
  currency: string;
  missing: boolean;
}) {
  return (
    <MissingValueCell missing={missing}>
      {amount != null ? formatMoney(amount, currency) : "—"}
    </MissingValueCell>
  );
}

export function FeePercentCell({
  rate,
  missing,
  notApplicable,
}: {
  rate: number | null;
  missing: boolean;
  notApplicable?: boolean;
}) {
  return (
    <MissingValueCell missing={missing} notApplicable={notApplicable}>
      {rate != null ? `${(rate * 100).toFixed(1)}%` : "—"}
    </MissingValueCell>
  );
}
