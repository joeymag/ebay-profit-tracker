-- Per-order eBay final value fee rate (decimal, e.g. 0.128 = 12.8%)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ebay_fee_rate numeric(6, 4);
