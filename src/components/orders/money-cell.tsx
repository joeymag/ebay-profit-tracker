import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyCellProps = {
  amount: number | null | undefined;
  currency: string;
  className?: string;
  emphasize?: boolean;
};

export function MoneyCell({
  amount,
  currency,
  className,
  emphasize,
}: MoneyCellProps) {
  if (amount == null) {
    return (
      <span className={cn("text-muted-foreground", className)}>—</span>
    );
  }

  return (
    <span
      className={cn(
        "tabular-nums",
        emphasize && amount >= 0 && "font-semibold text-primary",
        emphasize && amount < 0 && "text-destructive",
        className,
      )}
    >
      {formatMoney(amount, currency)}
    </span>
  );
}
