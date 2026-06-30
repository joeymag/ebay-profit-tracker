import {
  calendarDaysBetween,
  isSameOrBeforeCalendarDay,
  ymdFromIso,
} from "@/lib/orders/ebay-delivery-timing";

export type DeliverByTiming = {
  deliverByAt: string | null;
  deliveredAt: string | null;
  onTime: boolean | null;
  daysLate: number | null;
  overdue: boolean;
};

export function getDeliverByTiming(input: {
  deliverByAt: string | null;
  deliveredAt: string | null;
  shipmentStatus: string | null;
}): DeliverByTiming {
  const { deliverByAt, shipmentStatus } = input;
  const deliveredAt = input.deliveredAt ?? null;

  if (!deliverByAt) {
    return {
      deliverByAt: null,
      deliveredAt,
      onTime: null,
      daysLate: null,
      overdue: false,
    };
  }

  const isDelivered =
    shipmentStatus === "delivered" && deliveredAt != null;
  const todayYmd = ymdFromIso(new Date().toISOString());
  const overdue = !isDelivered && todayYmd > ymdFromIso(deliverByAt);

  if (!isDelivered) {
    return {
      deliverByAt,
      deliveredAt,
      onTime: null,
      daysLate: null,
      overdue,
    };
  }

  const onTime = isSameOrBeforeCalendarDay(deliveredAt, deliverByAt);
  const daysLate = onTime ? 0 : calendarDaysBetween(deliverByAt, deliveredAt);

  return {
    deliverByAt,
    deliveredAt,
    onTime,
    daysLate,
    overdue: false,
  };
}
