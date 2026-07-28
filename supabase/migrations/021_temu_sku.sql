ALTER TABLE order_line_items
  ADD COLUMN IF NOT EXISTS temu_sku text;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS temu_sku text;

CREATE INDEX IF NOT EXISTS order_line_items_temu_sku_idx
  ON order_line_items (temu_sku)
  WHERE temu_sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_temu_sku_uidx
  ON products (temu_sku)
  WHERE temu_sku IS NOT NULL;
