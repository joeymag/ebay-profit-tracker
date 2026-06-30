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

export function EbayFeeCell({
  actualAmount,
  rate,
  currency,
  missing,
  notApplicable,
}: {
  actualAmount: number | null;
  rate: number | null;
  currency: string;
  missing: boolean;
  notApplicable?: boolean;
}) {
  const hasActual =
    actualAmount != null && Number.isFinite(actualAmount) && actualAmount >= 0;

  return (
    <MissingValueCell missing={missing} notApplicable={notApplicable}>
      {hasActual ? (
        <span title="Synced from eBay Finances API">
          {formatMoney(actualAmount, currency)}
        </span>
      ) : rate != null ? (
        `${(rate * 100).toFixed(1)}%`
      ) : (
        "—"
      )}
    </MissingValueCell>
  );
}
