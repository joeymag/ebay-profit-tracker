"use client";

import { Badge } from "@/components/ui/badge";
import {
  formatShipmentStatus,
  shipmentStatusBadgeClass,
} from "@/lib/orders/shipment-status";
import { cn } from "@/lib/utils";

type ShipmentStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

export function ShipmentStatusBadge({
  status,
  className,
}: ShipmentStatusBadgeProps) {
  if (!status?.trim()) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit px-2 py-0 text-xs font-medium capitalize",
        shipmentStatusBadgeClass(status),
        className,
      )}
    >
      {formatShipmentStatus(status)}
    </Badge>
  );
}
