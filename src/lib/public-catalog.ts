/**
 * Explicit column projections for data returned to unauthenticated visitors.
 *
 * Never use `select("*")` on a public endpoint: a product row contains internal
 * fields such as `rejection_reason`, `file_checksum`, `file_id` and
 * `approved_by` that must stay server-side. Keeping the allowlist in one place
 * lets the public page and public API stay in sync. The value is a string
 * literal (not a joined array) so Supabase can still infer row types.
 */

export const PUBLIC_PRODUCT_COLUMNS =
  "id,seller_id,title,slug,description,short_description,category_id,tags,price,currency,status,preview_image_url,file_format,file_size,license_type,is_featured,view_count,created_at,approved_at";

export const PUBLIC_CATEGORY_COLUMNS = "id,name,slug,description";
