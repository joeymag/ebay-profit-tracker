ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipment_status text;
