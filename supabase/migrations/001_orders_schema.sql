-- Profit tracker tables (already applied if you created the DB in Supabase)

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  orders_imported integer NOT NULL DEFAULT 0,
  postage_labels_found integer NOT NULL DEFAULT 0,
  tracking_found integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS orders (
  shopify_id bigint PRIMARY KEY,
  order_number text NOT NULL,
  created_at timestamptz NOT NULL,
  financial_status text NOT NULL,
  fulfillment_status text,
  tags text,
  buyer_name text,
  currency text NOT NULL DEFAULT 'GBP',
  revenue numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL,
  tax numeric(12, 2) NOT NULL DEFAULT 0,
  shipping_charged numeric(12, 2) NOT NULL DEFAULT 0,
  shipping_label_cost numeric(12, 2),
  product_cost numeric(12, 2),
  shipping_service text,
  shipping_carrier text,
  tracking_numbers text[] NOT NULL DEFAULT '{}',
  tracking_url text,
  item_count integer NOT NULL DEFAULT 0,
  cost numeric(12, 2),
  profit numeric(12, 2),
  shopify_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_line_items (
  shopify_line_item_id bigint NOT NULL,
  shopify_order_id bigint NOT NULL REFERENCES orders (shopify_id) ON DELETE CASCADE,
  title text NOT NULL,
  quantity integer NOT NULL,
  sku text,
  price numeric(12, 2) NOT NULL,
  image_url text,
  PRIMARY KEY (shopify_order_id, shopify_line_item_id)
);
