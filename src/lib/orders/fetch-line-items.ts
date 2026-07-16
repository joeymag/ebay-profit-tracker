import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseAdmin } from "@/lib/supabase/client";

type LineItemRow = Database["public"]["Tables"]["order_line_items"]["Row"];

const LINE_ITEMS_PAGE_SIZE = 1000;

export async function fetchAllLineItemsFromSupabase(): Promise<LineItemRow[]> {
  const supabase = createSupabaseAdmin();
  const items: LineItemRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("order_line_items")
      .select("*")
      .range(offset, offset + LINE_ITEMS_PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const batch = data ?? [];
    items.push(...batch);

    if (batch.length < LINE_ITEMS_PAGE_SIZE) {
      break;
    }

    offset += LINE_ITEMS_PAGE_SIZE;
  }

  return items;
}
