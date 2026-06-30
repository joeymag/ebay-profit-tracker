ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amazon_order_id text;

CREATE INDEX IF NOT EXISTS orders_amazon_order_id_idx
  ON orders (amazon_order_id)
  WHERE amazon_order_id IS NOT NULL;
