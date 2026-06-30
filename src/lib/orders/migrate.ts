import fs from "fs/promises";
import path from "path";

import { withComputedFinancials } from "@/lib/orders/financials";
import type { OrdersDatabase, StoredOrder } from "@/lib/orders/types";

const ORDERS_FILE = path.join(process.cwd(), "data", "orders.json");

function normalizeLegacyOrder(order: StoredOrder & { shipping?: number }): StoredOrder {
  if (
    order.shippingCharged == null &&
    typeof order.shipping === "number"
  ) {
    order.shippingCharged = order.shipping;
  }
  return order as StoredOrder;
}

/** Read orders from local JSON file (for one-time migration to Supabase). */
export async function readOrdersFromJson(): Promise<OrdersDatabase> {
  const raw = await fs.readFile(ORDERS_FILE, "utf-8");
  const parsed = JSON.parse(raw) as OrdersDatabase;
  return {
    ...parsed,
    orders: parsed.orders.map((o) =>
      withComputedFinancials(normalizeLegacyOrder(o as StoredOrder & { shipping?: number })),
    ),
  };
}
