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
          temu_order_id: string | null;
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
          shipping_label_gid: string | null;
          ebay_fee_rate: number | null;
          ebay_ads_fee_rate: number | null;
          ebay_fees_actual: number | null;
          ebay_ads_fee_actual: number | null;
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
          temu_order_id?: string | null;
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
          shipping_label_gid?: string | null;
          ebay_fee_rate?: number | null;
          ebay_ads_fee_rate?: number | null;
          ebay_fees_actual?: number | null;
          ebay_ads_fee_actual?: number | null;
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
          temu_sku: string | null;
          price: number;
          image_url: string | null;
        };
        Insert: {
          shopify_line_item_id: number;
          shopify_order_id: number;
          title: string;
          quantity: number;
          sku?: string | null;
          temu_sku?: string | null;
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
          default_postage: number | null;
          image_url: string | null;
          shopify_product_id: number | null;
          temu_sku: string | null;
          updated_at: string;
        };
        Insert: {
          sku: string;
          title: string;
          unit_cost?: number | null;
          default_postage?: number | null;
          image_url?: string | null;
          shopify_product_id?: number | null;
          temu_sku?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      amazon_oauth: {
        Row: {
          id: string;
          refresh_token: string;
          seller_id: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          refresh_token: string;
          seller_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["amazon_oauth"]["Insert"]>;
        Relationships: [];
      };
      temu_oauth: {
        Row: {
          id: string;
          app_key: string;
          app_secret: string;
          access_token: string;
          region: string;
          mall_id: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          app_key: string;
          app_secret: string;
          access_token: string;
          region?: string;
          mall_id?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["temu_oauth"]["Insert"]>;
        Relationships: [];
      };
      amazon_listings_cache: {
        Row: {
          marketplace_id: string;
          listings: unknown;
          fetched_at: string;
        };
        Insert: {
          marketplace_id: string;
          listings?: unknown;
          fetched_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["amazon_listings_cache"]["Insert"]
        >;
        Relationships: [];
      };
      amazon_competitive_cache: {
        Row: {
          sku: string;
          snapshot: unknown;
          fetched_at: string;
        };
        Insert: {
          sku: string;
          snapshot: unknown;
          fetched_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["amazon_competitive_cache"]["Insert"]
        >;
        Relationships: [];
      };
      ebay_competitor_listings: {
        Row: {
          id: string;
          our_listing_id: string;
          competitor_name: string;
          competitor_item_id: string;
          competitor_title: string | null;
          competitor_url: string | null;
          variation_count: number;
          prices: unknown;
          fetched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          our_listing_id: string;
          competitor_name: string;
          competitor_item_id: string;
          competitor_title?: string | null;
          competitor_url?: string | null;
          variation_count?: number;
          prices?: unknown;
          fetched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_competitor_listings"]["Insert"]
        >;
        Relationships: [];
      };
      amazon_reprice_events: {
        Row: {
          id: number;
          sku: string;
          from_price: number | null;
          to_price: number;
          source: string;
          reason: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          sku: string;
          from_price?: number | null;
          to_price: number;
          source?: string;
          reason?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["amazon_reprice_events"]["Insert"]
        >;
        Relationships: [];
      };
      amazon_reprice_rules: {
        Row: {
          sku: string;
          enabled: boolean;
          strategy: string;
          min_price: number | null;
          max_price: number | null;
          undercut_amount: number;
          updated_at: string;
        };
        Insert: {
          sku: string;
          enabled?: boolean;
          strategy?: string;
          min_price?: number | null;
          max_price?: number | null;
          undercut_amount?: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["amazon_reprice_rules"]["Insert"]
        >;
        Relationships: [];
      };
      quickbooks_oauth: {
        Row: {
          id: string;
          realm_id: string;
          refresh_token: string;
          access_token: string | null;
          access_expires_at: string | null;
          company_name: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          realm_id: string;
          refresh_token: string;
          access_token?: string | null;
          access_expires_at?: string | null;
          company_name?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["quickbooks_oauth"]["Insert"]
        >;
        Relationships: [];
      };
      quickbooks_transactions: {
        Row: {
          id: string;
          realm_id: string;
          txn_key: string;
          txn_date: string;
          txn_type: string | null;
          doc_number: string | null;
          name: string | null;
          memo: string | null;
          account_name: string | null;
          split_account: string | null;
          amount: number;
          synced_at: string;
        };
        Insert: {
          id: string;
          realm_id: string;
          txn_key: string;
          txn_date: string;
          txn_type?: string | null;
          doc_number?: string | null;
          name?: string | null;
          memo?: string | null;
          account_name?: string | null;
          split_account?: string | null;
          amount: number;
          synced_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["quickbooks_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      marketplace_payments: {
        Row: {
          channel: string;
          external_id: string;
          paid_at: string | null;
          txn_type: string | null;
          status: string | null;
          reference: string | null;
          description: string | null;
          batch_id: string | null;
          product_charges: number | null;
          other_amount: number | null;
          amount: number | null;
          currency: string;
          synced_at: string;
        };
        Insert: {
          channel: string;
          external_id: string;
          paid_at?: string | null;
          txn_type?: string | null;
          status?: string | null;
          reference?: string | null;
          description?: string | null;
          batch_id?: string | null;
          product_charges?: number | null;
          other_amount?: number | null;
          amount?: number | null;
          currency?: string;
          synced_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["marketplace_payments"]["Insert"]
        >;
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
      ebay_listing_title_periods: {
        Row: {
          id: string;
          listing_id: string;
          title: string;
          sku: string | null;
          image_url: string | null;
          notes: string | null;
          applied_to_ebay: boolean;
          ebay_update_error: string | null;
          started_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          title: string;
          sku?: string | null;
          image_url?: string | null;
          notes?: string | null;
          applied_to_ebay?: boolean;
          ebay_update_error?: string | null;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_listing_title_periods"]["Insert"]
        >;
        Relationships: [];
      };
      ebay_listing_traffic_days: {
        Row: {
          listing_id: string;
          metric_date: string;
          marketplace_id: string;
          title: string | null;
          search_impressions: number | null;
          total_impressions: number | null;
          all_impressions: number | null;
          views: number | null;
          click_through_rate: number | null;
          transactions: number | null;
          sales_conversion_rate: number | null;
          fetched_at: string;
        };
        Insert: {
          listing_id: string;
          metric_date: string;
          marketplace_id: string;
          title?: string | null;
          search_impressions?: number | null;
          total_impressions?: number | null;
          all_impressions?: number | null;
          views?: number | null;
          click_through_rate?: number | null;
          transactions?: number | null;
          sales_conversion_rate?: number | null;
          fetched_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_listing_traffic_days"]["Insert"]
        >;
        Relationships: [];
      };
      ebay_listing_traffic_sync: {
        Row: {
          metric_date: string;
          listing_count: number;
          fetched_at: string;
        };
        Insert: {
          metric_date: string;
          listing_count: number;
          fetched_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_listing_traffic_sync"]["Insert"]
        >;
        Relationships: [];
      };
      ebay_live_listings: {
        Row: {
          listing_id: string;
          sku: string;
          title: string | null;
          offer_id: string | null;
          status: string;
          format: string | null;
          marketplace_id: string;
          price: number | null;
          currency: string | null;
          quantity: number | null;
          image_url: string | null;
          item_web_url: string | null;
          promo_rate_percent: number | null;
          promo_ad_status: string | null;
          promo_campaign_name: string | null;
          promo_campaign_id: string | null;
          promo_ad_id: string | null;
          unit_cost: number | null;
          default_postage: number | null;
          transactions_last_30_days: number | null;
          synced_at: string;
        };
        Insert: {
          listing_id: string;
          sku: string;
          title?: string | null;
          offer_id?: string | null;
          status: string;
          format?: string | null;
          marketplace_id: string;
          price?: number | null;
          currency?: string | null;
          quantity?: number | null;
          image_url?: string | null;
          item_web_url?: string | null;
          promo_rate_percent?: number | null;
          promo_ad_status?: string | null;
          promo_campaign_name?: string | null;
          promo_campaign_id?: string | null;
          promo_ad_id?: string | null;
          unit_cost?: number | null;
          default_postage?: number | null;
          transactions_last_30_days?: number | null;
          synced_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_live_listings"]["Insert"]
        >;
        Relationships: [];
      };
      ebay_description_template: {
        Row: {
          id: string;
          html: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          html: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["ebay_description_template"]["Insert"]
        >;
        Relationships: [];
      };
      inventory_masters: {
        Row: {
          sku: string;
          pack_size: number;
          pieces_on_hand: number;
          label: string | null;
          updated_at: string;
        };
        Insert: {
          sku: string;
          pack_size: number;
          pieces_on_hand?: number;
          label?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_masters"]["Insert"]
        >;
        Relationships: [];
      };
      inventory_child_mappings: {
        Row: {
          child_sku: string;
          master_sku: string;
          pieces_per_unit: number;
          label: string | null;
          updated_at: string;
        };
        Insert: {
          child_sku: string;
          master_sku: string;
          pieces_per_unit: number;
          label?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_child_mappings"]["Insert"]
        >;
        Relationships: [];
      };
      inventory_consumption: {
        Row: {
          shopify_line_item_id: number;
          shopify_order_id: number;
          master_sku: string;
          pieces_consumed: number;
          updated_at: string;
        };
        Insert: {
          shopify_line_item_id: number;
          shopify_order_id: number;
          master_sku: string;
          pieces_consumed: number;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_consumption"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
