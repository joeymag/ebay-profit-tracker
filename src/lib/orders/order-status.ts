type OrderCancellationFields = {
  financialStatus: string;
  cancelledAt?: string | null;
};

/** True when Shopify cancelled the order (cancelled_at or voided/cancelled payment status). */
export function isOrderCancelled(order: OrderCancellationFields | string): boolean {
  if (typeof order === "string") {
    const normalized = order.trim().toLowerCase();
    return normalized.includes("cancel") || normalized === "voided";
  }

  if (order.cancelledAt?.trim()) {
    return true;
  }

  return isOrderCancelled(order.financialStatus);
}
