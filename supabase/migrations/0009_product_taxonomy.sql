-- Buyer-focused product taxonomy.
--
-- `file_format` stays the technical file extension (pdf, epub, zip, ...).
-- `content_type` answers a different question: what is the buyer getting and
-- how will they use it? Categories answer "what is this for?". Keeping these
-- separate makes ebooks, templates, courses and bundles distinguishable even
-- when they all arrive as a PDF or ZIP.

alter table public.products
  add column if not exists content_type text;

do $$
begin
  alter table public.products
    drop constraint if exists products_content_type_check;
  alter table public.products
    add constraint products_content_type_check
    check (
      content_type is null
      or content_type in (
        'ebook',
        'template',
        'planner_printable',
        'course_workshop',
        'creative_asset',
        'stock_media',
        'spreadsheet_tracker',
        'ai_prompt_pack',
        'bundle_starter_kit',
        'digital_tool',
        'document'
      )
    );
end $$;

create index if not exists products_content_type_idx on public.products (content_type);

-- Column privileges are cumulative with 0004. Re-grant the full public
-- allowlist here so the new column is explicitly readable and future internal
-- columns are not exposed by a table-wide grant.
revoke select on public.products from anon, authenticated;
grant select (
  id,
  seller_id,
  title,
  slug,
  description,
  short_description,
  category_id,
  content_type,
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

-- Refresh the category taxonomy. Old format/tool-specific categories are
-- removed only when no product references them, so real catalog data is safe.
insert into public.categories (name, slug, description) values
  ('Templates & Productivity', 'templates-productivity', 'Reusable layouts and systems for work, study and everyday organization.'),
  ('Planners & Printables', 'planners-printables', 'Printable and digital planners, trackers, calendars and worksheets.'),
  ('Ebooks & Guides', 'ebooks-guides', 'Readable guides, reference books and step-by-step ebooks.'),
  ('Courses & Workshops', 'courses-workshops', 'Structured lessons and exercises that teach a specific skill.'),
  ('Creative Assets', 'creative-assets', 'Graphics, icons, mockups, fonts and elements for creative projects.'),
  ('Stock Media', 'stock-media', 'Ready-to-use photos, video clips, audio and other media files.'),
  ('Business & Finance Tools', 'business-finance-tools', 'Resources for budgets, invoices, clients, marketing and operations.'),
  ('AI & Tech Tools', 'ai-tech-tools', 'AI workflows, prompt systems and practical tech resources.'),
  ('Education & Teacher Resources', 'education-teacher-resources', 'Classroom materials, lesson plans and learning resources.'),
  ('Bundles & Starter Kits', 'bundles-starter-kits', 'Curated multi-product kits for getting started quickly.')
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description;

delete from public.categories c
where c.slug not in (
  'templates-productivity',
  'planners-printables',
  'ebooks-guides',
  'courses-workshops',
  'creative-assets',
  'stock-media',
  'business-finance-tools',
  'ai-tech-tools',
  'education-teacher-resources',
  'bundles-starter-kits'
)
and not exists (
  select 1 from public.products p where p.category_id = c.id
);
