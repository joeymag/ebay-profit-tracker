-- Manual product cost override for eBay orders (ex-VAT, catalog skipped when true)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS product_cost_manual boolean NOT NULL DEFAULT false;
