import { Badge } from "@/components/ui/badge";
import { formatDeliveryDate } from "@/lib/format";
import { getAmazonDeliveryTiming } from "@/lib/orders/amazon-delivery-timing";
import { getSalesChannel } from "@/lib/orders/channel";
import type { DeliverByTiming } from "@/lib/orders/deliver-by-timing";
import {
  EBAY_ON_TIME_DELIVERY_DAYS,
  formatOnTimeDeliveryLabel,
  getEbayDeliveryTiming,
  onTimeDeliveryBadgeClass,
} from "@/lib/orders/ebay-delivery-timing";
import type { StoredOrder } from "@/lib/orders/types";
import { cn } from "@/lib/utils";

type OnTimeDeliveryBadgeProps = {
  order: Pick<
    StoredOrder,
    | "tags"
    | "createdAt"
    | "shipmentStatus"
    | "deliveredAt"
    | "amazonDeliverByAt"
    | "ebayDeliverByAt"
  >;
  className?: string;
};

function DeliverByOnTimeBadge({
  timing,
  channelLabel,
  className,
  pending,
}: {
  timing: DeliverByTiming;
  channelLabel: string;
  className?: string;
  pending?: boolean;
}) {
  if (pending) {
    return (
      <Badge
        variant="outline"
        className={cn(
          "w-fit px-2 py-0 text-xs font-medium",
          "border-border bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        Delivered · date pending sync
      </Badge>
    );
  }

  if (!timing.deliverByAt) {
    return null;
  }

  const deliverByLabel = formatDeliveryDate(timing.deliverByAt);

  if (timing.onTime != null && timing.deliveredAt) {
    const deliveredLabel = formatDeliveryDate(timing.deliveredAt);
    const timingLabel = timing.onTime
      ? "On time"
      : timing.daysLate != null && timing.daysLate > 0
        ? `Late (${timing.daysLate}d)`
        : "Late";

    return (
      <Badge
        variant="outline"
        title={
          timing.onTime
            ? `Delivered ${deliveredLabel} · on or before ${channelLabel} deliver-by ${deliverByLabel}`
            : `Delivered ${deliveredLabel} · after ${channelLabel} deliver-by ${deliverByLabel}`
        }
        className={cn(
          "w-fit px-2 py-0 text-xs font-medium",
          onTimeDeliveryBadgeClass(timing.onTime),
          className,
        )}
      >
        {deliveredLabel} · {timingLabel}
      </Badge>
    );
  }

  if (timing.overdue) {
    return (
      <Badge
        variant="outline"
        title={`${channelLabel} deliver-by was ${deliverByLabel} · not delivered yet`}
        className={cn(
          "w-fit px-2 py-0 text-xs font-medium",
          onTimeDeliveryBadgeClass(false),
          className,
        )}
      >
        Deliver by {deliverByLabel} · Overdue
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      title={`${channelLabel} deliver-by ${deliverByLabel}`}
      className={cn(
        "w-fit px-2 py-0 text-xs font-medium",
        onTimeDeliveryBadgeClass(null),
        className,
      )}
    >
      Deliver by {deliverByLabel} · Pending
    </Badge>
  );
}

function EbayOnTimeDeliveryBadge({
  order,
  className,
}: OnTimeDeliveryBadgeProps) {
  const timing = getEbayDeliveryTiming(order);
  const pending =
    order.shipmentStatus === "delivered" && !order.deliveredAt;

  if (timing.usesDeliverByDate) {
    return (
      <DeliverByOnTimeBadge
        timing={timing}
        channelLabel="eBay"
        className={className}
        pending={pending}
      />
    );
  }

  if (pending) {
    return (
      <DeliverByOnTimeBadge
        timing={{
          deliverByAt: null,
          deliveredAt: null,
          onTime: null,
          daysLate: null,
          overdue: false,
        }}
        channelLabel="eBay"
        className={className}
        pending
      />
    );
  }

  if (timing.onTime == null || !timing.deliveredAt) {
    return null;
  }

  const deliveredLabel = formatDeliveryDate(timing.deliveredAt);
  const timingLabel =
    timing.daysToDeliver != null
      ? `${timing.daysToDeliver}d · ${formatOnTimeDeliveryLabel(timing.onTime)}`
      : formatOnTimeDeliveryLabel(timing.onTime);

  return (
    <Badge
      variant="outline"
      title={`Delivered ${deliveredLabel} · within ${EBAY_ON_TIME_DELIVERY_DAYS} calendar days of order`}
      className={cn(
        "w-fit px-2 py-0 text-xs font-medium",
        onTimeDeliveryBadgeClass(timing.onTime),
        className,
      )}
    >
      {deliveredLabel} · {timingLabel}
    </Badge>
  );
}

export function OnTimeDeliveryBadge({
  order,
  className,
}: OnTimeDeliveryBadgeProps) {
  const channel = getSalesChannel(order.tags);

  if (channel === "Amazon") {
    return (
      <DeliverByOnTimeBadge
        timing={getAmazonDeliveryTiming(order)}
        channelLabel="Amazon"
        className={className}
        pending={order.shipmentStatus === "delivered" && !order.deliveredAt}
      />
    );
  }

  if (channel === "eBay") {
    return <EbayOnTimeDeliveryBadge order={order} className={className} />;
  }

  return null;
}
