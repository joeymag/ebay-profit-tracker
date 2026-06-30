import { ShipmentStatusBadge } from "@/components/orders/shipment-status-badge";
import { cn } from "@/lib/utils";

type OrderTrackingProps = {
  numbers: string[];
  url: string | null | undefined;
  shipmentStatus?: string | null;
  className?: string;
};

export function OrderTracking({
  numbers,
  url,
  shipmentStatus,
  className,
}: OrderTrackingProps) {
  if (!numbers.length && !shipmentStatus) {
    return <span className="text-muted-foreground">—</span>;
  }

  const primary = numbers[0];

  return (
    <div className={cn("max-w-[11rem] space-y-1.5", className)}>
      {shipmentStatus ? (
        <ShipmentStatusBadge status={shipmentStatus} />
      ) : null}
      {primary ? (
        url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-mono text-sm text-primary underline-offset-4 hover:underline"
            title={primary}
          >
            {primary}
          </a>
        ) : (
          <span className="block truncate font-mono text-sm" title={primary}>
            {primary}
          </span>
        )
      ) : null}
      {numbers.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          +{numbers.length - 1} more
        </p>
      ) : null}
    </div>
  );
}
