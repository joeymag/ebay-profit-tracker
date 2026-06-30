-- Per-order eBay promoted listings / ads fee rate (decimal)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ebay_ads_fee_rate numeric(6, 4);
