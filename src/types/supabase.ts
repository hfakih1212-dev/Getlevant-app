export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      favorites: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_usd: number
          variant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price_usd: number
          variant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price_usd?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          delivery_address: string | null
          delivery_fee_usd: number
          delivery_region: string | null
          discount_usd: number
          id: string
          notes: string | null
          order_number: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          shopper_id: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_usd: number
          total_usd: number
          updated_at: string | null
          voucher_code: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_address?: string | null
          delivery_fee_usd?: number
          delivery_region?: string | null
          discount_usd?: number
          id?: string
          notes?: string | null
          order_number?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shopper_id: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal_usd: number
          total_usd: number
          updated_at?: string | null
          voucher_code?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_address?: string | null
          delivery_fee_usd?: number
          delivery_region?: string | null
          discount_usd?: number
          id?: string
          notes?: string | null
          order_number?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shopper_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal_usd?: number
          total_usd?: number
          updated_at?: string | null
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_shopper_id_fkey"
            columns: ["shopper_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string | null
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          color_hex: string | null
          created_at: string | null
          id: string
          product_id: string
          size: string | null
          stock: number
        }
        Insert: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string
          product_id: string
          size?: string | null
          stock?: number
        }
        Update: {
          color?: string | null
          color_hex?: string | null
          created_at?: string | null
          id?: string
          product_id?: string
          size?: string | null
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: Database["public"]["Enums"]["product_category"] | null
          condition: Database["public"]["Enums"]["product_condition"]
          created_at: string | null
          description: string | null
          id: string
          is_promoted: boolean
          name: string
          price_usd: number
          promotion_expires_at: string | null
          status: string
          store_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["product_category"] | null
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_promoted?: boolean
          name: string
          price_usd: number
          promotion_expires_at?: string | null
          status?: string
          store_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["product_category"] | null
          condition?: Database["public"]["Enums"]["product_condition"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_promoted?: boolean
          name?: string
          price_usd?: number
          promotion_expires_at?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          duration_days: number
          id: string
          product_id: string
          requested_by: string
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          duration_days: number
          id?: string
          product_id: string
          requested_by: string
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          duration_days?: number
          id?: string
          product_id?: string
          requested_by?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          order_id: string
          rating: number
          shopper_id: string
          store_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          rating: number
          shopper_id: string
          store_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          rating?: number
          shopper_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_shopper_id_fkey"
            columns: ["shopper_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          code: string
          created_at: string | null
          discount_pct: number
          id: string
          milestone: number
          seen: boolean
          status: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_pct: number
          id?: string
          milestone: number
          seen?: boolean
          status?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_pct?: number
          id?: string
          milestone?: number
          seen?: boolean
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          location: string | null
          occurred_at: string
          raw_payload: Json | null
          shipment_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          location?: string | null
          occurred_at?: string
          raw_payload?: Json | null
          shipment_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          location?: string | null
          occurred_at?: string
          raw_payload?: Json | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          courier_name: string
          courier_phone: string | null
          courier_type: Database["public"]["Enums"]["courier_type"]
          created_at: string | null
          id: string
          order_id: string
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_id: string | null
          updated_at: string | null
          webhook_data: Json | null
        }
        Insert: {
          courier_name: string
          courier_phone?: string | null
          courier_type: Database["public"]["Enums"]["courier_type"]
          created_at?: string | null
          id?: string
          order_id: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_id?: string | null
          updated_at?: string | null
          webhook_data?: Json | null
        }
        Update: {
          courier_name?: string
          courier_phone?: string | null
          courier_type?: Database["public"]["Enums"]["courier_type"]
          created_at?: string | null
          id?: string
          order_id?: string
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_id?: string | null
          updated_at?: string | null
          webhook_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string | null
          description: string | null
          facebook: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          owner_id: string
          rating: number | null
          region: string | null
          status: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          rating?: number | null
          region?: string | null
          status?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          rating?: number | null
          region?: string | null
          status?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          completed_orders_count: number
          created_at: string | null
          email: string | null
          id: string
          notification_prefs: Json
          phone: string | null
          push_token: string | null
          referral_code: string | null
          referred_by: string | null
          role: string
          store_id: string | null
        }
        Insert: {
          completed_orders_count?: number
          created_at?: string | null
          email?: string | null
          id: string
          notification_prefs?: Json
          phone?: string | null
          push_token?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          store_id?: string | null
        }
        Update: {
          completed_orders_count?: number
          created_at?: string | null
          email?: string | null
          id?: string
          notification_prefs?: Json
          phone?: string | null
          push_token?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_promotion_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      become_vendor: { Args: never; Returns: undefined }
      current_user_role: { Args: never; Returns: string }
      ensure_my_profile: {
        Args: never
        Returns: {
          completed_orders_count: number
          created_at: string | null
          email: string | null
          id: string
          notification_prefs: Json
          phone: string | null
          push_token: string | null
          referral_code: string | null
          referred_by: string | null
          role: string
          store_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owns_store: { Args: { p_store_id: string }; Returns: boolean }
      place_order: {
        Args: {
          p_delivery_address: string
          p_delivery_region: string
          p_items: Json
          p_payment_method: string
          p_store_id: string
          p_voucher_code?: string
        }
        Returns: {
          id: string
          order_number: string
        }[]
      }
      redeem_referral: { Args: { p_code: string }; Returns: undefined }
      reject_promotion_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      vendor_analytics: { Args: never; Returns: Json }
      admin_vendor_analytics: { Args: never; Returns: Json }
      admin_vendor_list: { Args: never; Returns: Json }
      admin_vendor_card: { Args: { p_store_id: string }; Returns: Json }
    }
    Enums: {
      courier_type:
        | "aramex"
        | "dhl"
        | "fedex"
        | "tnt"
        | "local_courier"
        | "internal"
        | "other"
      order_status:
        | "placed"
        | "confirmed"
        | "preparing"
        | "ready"
        | "dispatched"
        | "delivered"
        | "cancelled"
      payment_method: "whatsapp" | "cash_on_delivery" | "bank_transfer"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      product_category:
        | "tops"
        | "bottoms"
        | "dresses"
        | "outerwear"
        | "accessories"
        | "shoes"
      product_condition: "brand_new" | "thrifted"
      shipment_status:
        | "pending"
        | "picked_up"
        | "in_transit"
        | "out_for_delivery"
        | "delivered"
        | "failed"
        | "returned"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      courier_type: [
        "aramex",
        "dhl",
        "fedex",
        "tnt",
        "local_courier",
        "internal",
        "other",
      ],
      order_status: [
        "placed",
        "confirmed",
        "preparing",
        "ready",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      payment_method: ["whatsapp", "cash_on_delivery", "bank_transfer"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      product_category: [
        "tops",
        "bottoms",
        "dresses",
        "outerwear",
        "accessories",
        "shoes",
      ],
      product_condition: ["brand_new", "thrifted"],
      shipment_status: [
        "pending",
        "picked_up",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "failed",
        "returned",
      ],
    },
  },
} as const
