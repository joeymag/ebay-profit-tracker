CREATE TABLE IF NOT EXISTS ebay_listing_title_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id text NOT NULL,
  title text NOT NULL,
  sku text,
  image_url text,
  notes text,
  applied_to_ebay boolean NOT NULL DEFAULT false,
  ebay_update_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ebay_listing_title_periods_listing_idx
  ON ebay_listing_title_periods (listing_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ebay_listing_title_periods_active_idx
  ON ebay_listing_title_periods (listing_id)
  WHERE ended_at IS NULL;
