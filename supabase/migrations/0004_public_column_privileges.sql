-- RLS restricts which product ROWS an anonymous/authenticated client can see,
-- but it does not restrict COLUMNS. Without column privileges, a client using
-- the publishable anon key could call the REST endpoint with `select=*` and
-- read internal fields such as rejection_reason, file_checksum, file_id and
-- approved_by. Server-side reads use the service role and are unaffected.

revoke select on public.products from anon, authenticated;
grant select (
  id,
  seller_id,
  title,
  slug,
  description,
  short_description,
  category_id,
  tags,
  price,
  currency,
  status,
  preview_image_url,
  file_format,
  file_size,
  license_type,
  is_featured,
  view_count,
  created_at,
  approved_at
) on public.products to anon, authenticated;

-- Categories hold only public metadata today; keep an explicit allowlist so
-- any future internal column is not exposed automatically.
revoke select on public.categories from anon, authenticated;
grant select (id, name, slug, description) on public.categories to anon, authenticated;
