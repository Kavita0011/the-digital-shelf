/**
 * Minimal generated-style types for the public schema. Regenerate with:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT > src/lib/database.types.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          password_hash: string | null;
          full_name: string | null;
          role: "buyer" | "seller" | "admin" | "super_admin";
          status: "active" | "suspended" | "banned";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: "buyer" | "seller" | "admin" | "super_admin";
        };
        Update: { full_name?: string | null; status?: string; role?: string };
      };
      products: {
        Row: {
          id: string;
          seller_id: string;
          title: string;
          slug: string;
          description: string;
          short_description: string;
          category_id: string | null;
          content_type: string | null;
          tags: string[];
          price: number;
          currency: string;
          status: string;
          rejection_reason: string | null;
          preview_image_url: string | null;
          file_id: string | null;
          file_format: string | null;
          file_size: number | null;
          file_checksum: string | null;
          license_type: string;
          is_featured: boolean;
          download_count: number;
          view_count: number;
          created_at: string;
          updated_at: string;
          approved_at: string | null;
          approved_by: string | null;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      products_with_seller: never;
      [table: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_order_id: string;
          p_payment_id?: string | null;
          p_reason?: string | null;
        };
        Returns: string;
      };
      consume_download_token: {
        Args: { p_token: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
  };
}
