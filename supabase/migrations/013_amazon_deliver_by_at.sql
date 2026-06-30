ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amazon_deliver_by_at timestamptz;
