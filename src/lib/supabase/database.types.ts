export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          shopify_id: number;
          order_number: string;
          created_at: string;
          cancelled_at: string | null;
          financial_status: string;
          fulfillment_status: string | null;
          tags: string | null;
          buyer_name: string | null;
          ebay_username: string | null;
          ebay_order_id: string | null;
          amazon_order_id: string | null;
          amazon_deliver_by_at: string | null;
          ebay_deliver_by_at: string | null;
          shipping_address1: string | null;
          shipping_address2: string | null;
          shipping_city: string | null;
          shipping_province: string | null;
          shipping_zip: string | null;
          shipping_country: string | null;
          shipping_country_code: string | null;
          shipping_phone: string | null;
          latitude: number | null;
          longitude: number | null;
          geocode_region: string | null;
          geocoded_at: string | null;
          currency: string;
          revenue: number;
          subtotal: number;
          tax: number;
          shipping_charged: number;
          shipping_label_cost: number | null;
          ebay_fee_rate: number | null;
          ebay_ads_fee_rate: number | null;
          ebay_fees_actual: number | null;
          ebay_fees_synced_at: string | null;
          product_cost: number | null;
          product_cost_manual: boolean;
          shipping_service: string | null;
          shipping_carrier: string | null;
          tracking_numbers: string[];
          tracking_url: string | null;
          shipment_status: string | null;
          delivered_at: string | null;
          item_count: number;
          cost: number | null;
          profit: number | null;
          shopify_updated_at: string | null;
          synced_at: string;
        };
        Insert: {
          shopify_id: number;
          order_number: string;
          created_at: string;
          cancelled_at: string | null;
          financial_status: string;
          fulfillment_status?: string | null;
          tags?: string | null;
          buyer_name?: string | null;
          ebay_username?: string | null;
          ebay_order_id?: string | null;
          amazon_order_id?: string | null;
          amazon_deliver_by_at?: string | null;
          ebay_deliver_by_at?: string | null;
          shipping_address1?: string | null;
          shipping_address2?: string | null;
          shipping_city?: string | null;
          shipping_province?: string | null;
          shipping_zip?: string | null;
          shipping_country?: string | null;
          shipping_country_code?: string | null;
          shipping_phone?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          geocode_region?: string | null;
          geocoded_at?: string | null;
          currency?: string;
          revenue: number;
          subtotal: number;
          tax?: number;
          shipping_charged?: number;
          shipping_label_cost?: number | null;
          ebay_fee_rate?: number | null;
          ebay_ads_fee_rate?: number | null;
          ebay_fees_actual?: number | null;
          ebay_fees_synced_at?: string | null;
          product_cost?: number | null;
          product_cost_manual?: boolean;
          shipping_service?: string | null;
          shipping_carrier?: string | null;
          tracking_numbers?: string[];
          tracking_url?: string | null;
          shipment_status?: string | null;
          delivered_at?: string | null;
          item_count?: number;
          cost?: number | null;
          profit?: number | null;
          shopify_updated_at?: string | null;
          synced_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      order_line_items: {
        Row: {
          shopify_line_item_id: number;
          shopify_order_id: number;
          title: string;
          quantity: number;
          sku: string | null;
          price: number;
          image_url: string | null;
        };
        Insert: {
          shopify_line_item_id: number;
          shopify_order_id: number;
          title: string;
          quantity: number;
          sku?: string | null;
          price: number;
          image_url?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["order_line_items"]["Insert"]
        >;
        Relationships: [];
      };
      deleted_orders: {
        Row: {
          shopify_id: number;
          deleted_at: string;
        };
        Insert: {
          shopify_id: number;
          deleted_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["deleted_orders"]["Insert"]
        >;
        Relationships: [];
      };
      sync_runs: {
        Row: {
          id: string;
          started_at: string;
          completed_at: string | null;
          orders_imported: number;
          postage_labels_found: number;
          tracking_found: number;
          status: string;
        };
        Insert: {
          id?: string;
          started_at?: string;
          completed_at?: string | null;
          orders_imported?: number;
          postage_labels_found?: number;
          tracking_found?: number;
          status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sync_runs"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          sku: string;
          title: string;
          unit_cost: number | null;
          image_url: string | null;
          shopify_product_id: number | null;
          updated_at: string;
        };
        Insert: {
          sku: string;
          title: string;
          unit_cost?: number | null;
          image_url?: string | null;
          shopify_product_id?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      ebay_oauth: {
        Row: {
          id: string;
          refresh_token: string;
          signing_jwe: string | null;
          signing_key_id: string | null;
          signing_private_key: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          refresh_token: string;
          signing_jwe?: string | null;
          signing_key_id?: string | null;
          signing_private_key?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ebay_oauth"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
