ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_label_gid text;

COMMENT ON COLUMN public.orders.shipping_label_gid IS
  'Shopify ShippingLabel GID from shippingLabelPurchase, used to reprint label PDFs.';
