CREATE TABLE IF NOT EXISTS products (
  sku text PRIMARY KEY,
  title text NOT NULL,
  unit_cost numeric(12, 2),
  image_url text,
  shopify_product_id bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_title_idx ON products (title);
