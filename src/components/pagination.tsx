import Link from "next/link";
import { z } from "zod";

export type PageSearchParams = Record<string, string | string[] | undefined>;

const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

/** Validate the `page` query param; junk or out-of-range values fall back to page 1. */
export function parsePageParam(value: string | string[] | undefined): number {
  return pageSchema.parse(Array.isArray(value) ? value[0] : value);
}

/** Build a pagination link that preserves every other query param. */
export function pageHref(pathname: string, params: PageSearchParams, page: number): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  next.set("page", String(page));
  return `${pathname}?${next.toString()}`;
}

export function Pagination({
  page,
  pageSize,
  total,
  makeHref,
  noun = "results",
}: {
  page: number;
  pageSize: number;
  total: number;
  makeHref: (page: number) => string;
  noun?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const outOfRange = total === 0 || page > totalPages;
  const from = outOfRange ? 0 : (page - 1) * pageSize + 1;
  const to = outOfRange ? 0 : Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500" aria-live="polite">
        {total === 0
          ? `No ${noun} found`
          : outOfRange
            ? `No ${noun} on this page · ${total} ${noun} total · Page ${page} of ${totalPages}`
            : `Showing ${from}–${to} of ${total} ${noun} · Page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link className="btn-ghost" href={makeHref(page - 1)} rel="prev" aria-label="Previous page">← Previous</Link>
        ) : (
          <span className="btn-ghost pointer-events-none opacity-50" aria-disabled="true">← Previous</span>
        )}
        {page < totalPages ? (
          <Link className="btn-ghost" href={makeHref(page + 1)} rel="next" aria-label="Next page">Next →</Link>
        ) : (
          <span className="btn-ghost pointer-events-none opacity-50" aria-disabled="true">Next →</span>
        )}
      </div>
    </nav>
  );
}
