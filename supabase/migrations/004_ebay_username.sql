-- eBay buyer username extracted from Shopify buyer name

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ebay_username text;

CREATE INDEX IF NOT EXISTS orders_ebay_username_idx ON orders (ebay_username);

UPDATE orders
SET ebay_username = lower(trim(substring(buyer_name FROM '\(([^)]+)\)\s*$')))
WHERE buyer_name ~ '\([^)]+\)\s*$'
  AND tags ILIKE '%ebay%'
  AND (ebay_username IS NULL OR ebay_username = '');
