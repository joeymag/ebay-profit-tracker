-- Master SKUs: bulk packs (e.g. box of 1000 nuts)
CREATE TABLE IF NOT EXISTS inventory_masters (
  sku text PRIMARY KEY,
  pack_size integer NOT NULL DEFAULT 1 CHECK (pack_size > 0),
  pieces_on_hand numeric(12, 2) NOT NULL DEFAULT 0 CHECK (pieces_on_hand >= 0),
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Child SKUs sold on Shopify that consume master pieces per unit sold
CREATE TABLE IF NOT EXISTS inventory_child_mappings (
  child_sku text PRIMARY KEY,
  master_sku text NOT NULL REFERENCES inventory_masters (sku) ON DELETE CASCADE,
  pieces_per_unit numeric(12, 2) NOT NULL CHECK (pieces_per_unit > 0),
  label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_child_mappings_master_sku_idx
  ON inventory_child_mappings (master_sku);

-- Tracks pieces consumed per order line (idempotent on re-sync)
CREATE TABLE IF NOT EXISTS inventory_consumption (
  shopify_line_item_id bigint PRIMARY KEY,
  shopify_order_id bigint NOT NULL,
  master_sku text NOT NULL REFERENCES inventory_masters (sku) ON DELETE CASCADE,
  pieces_consumed numeric(12, 2) NOT NULL CHECK (pieces_consumed >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_consumption_order_idx
  ON inventory_consumption (shopify_order_id);
