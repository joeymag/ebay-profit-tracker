-- Orders removed from the profit tracker (e.g. cancelled). Sync will not re-import them.
CREATE TABLE IF NOT EXISTS deleted_orders (
  shopify_id bigint PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
