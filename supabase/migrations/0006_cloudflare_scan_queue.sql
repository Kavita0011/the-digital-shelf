-- Cloudflare Queues support: store the VirusTotal analysis id so background
-- queue consumers can poll without re-downloading the file from R2.
alter table public.product_files
  add column if not exists scan_analysis_id text;

create index if not exists product_files_scan_analysis_idx
  on public.product_files (scan_analysis_id)
  where scan_analysis_id is not null;

comment on column public.product_files.scan_analysis_id is
  'VirusTotal analysis id used by the Cloudflare Queue scan consumer.';
