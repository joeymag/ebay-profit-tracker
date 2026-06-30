-- Shipping address + geocode fields for order location analysis

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_address1 text,
  ADD COLUMN IF NOT EXISTS shipping_address2 text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_province text,
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_country text,
  ADD COLUMN IF NOT EXISTS shipping_country_code text,
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS geocode_region text,
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_shipping_city_idx ON orders (shipping_city);
CREATE INDEX IF NOT EXISTS orders_geocode_region_idx ON orders (geocode_region);
CREATE INDEX IF NOT EXISTS orders_shipping_zip_idx ON orders (shipping_zip);
