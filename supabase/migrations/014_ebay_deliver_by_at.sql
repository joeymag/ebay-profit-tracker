ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ebay_deliver_by_at timestamptz;
