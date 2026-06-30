"use client";

import { useMemo, useState } from "react";

import { BulkEditCostsBar } from "@/components/orders/bulk-edit-costs-bar";
import { OrdersTable } from "@/components/orders/orders-table";
import type { StoredOrder } from "@/lib/orders/types";

type OrdersPageClientProps = {
  orders: StoredOrder[];
  repeatEbayUsernames?: string[];
  productFilter?: string | null;
};

export function OrdersPageClient({
  orders,
  repeatEbayUsernames = [],
  productFilter,
}: OrdersPageClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.shopifyId)),
    [orders, selectedIds],
  );

  function toggleOrder(shopifyId: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(shopifyId);
      } else {
        next.delete(shopifyId);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(orders.map((o) => o.shopifyId)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="relative">
      <OrdersTable
        orders={orders}
        repeatEbayUsernames={repeatEbayUsernames}
        productFilter={productFilter}
        selectedIds={selectedIds}
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleOrder={toggleOrder}
        onToggleAll={toggleAll}
      />
      {selectedOrders.length > 0 ? (
        <BulkEditCostsBar
          selectedOrders={selectedOrders}
          onClearSelection={clearSelection}
        />
      ) : null}
    </div>
  );
}
