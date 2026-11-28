"use client";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { contentTypeLabel } from "@/lib/types";

export type TableRow = { id?: string } & Record<string, unknown>;

function columnLabel(column: string): string {
  return column.replace(/\./g, " ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function readValue(row: TableRow, column: string): unknown {
  return column.split(".").reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
    row,
  );
}

function cellValue(column: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (column === "content_type") return contentTypeLabel(value);
  if (column === "price") return `${Number(value)} credits`;
  if (Array.isArray(value)) {
    return value.length ? value.map((v) => cellValue(column, v)).join(", ") : "—";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("store_name" in obj) return String(obj.store_name ?? "—");
    if ("scan_status" in obj) return String(obj.scan_status ?? "—");
    return "—";
  }
  return String(value);
}

interface Props {
  endpoint: string;
  columns: string[];
  actions?: (row: TableRow, refresh: () => void) => React.ReactNode;
  /** Optional extra row rendered beneath each result row. */
  details?: (row: TableRow) => React.ReactNode;
  pageSize?: number;
}

export function AdminTable({ endpoint, columns, actions, details, pageSize = 25 }: Props) {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const searchId = useId();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await apiFetch<TableRow[]>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setPage(1); }, [query]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (current - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="flex items-center gap-2">
          <label className="label mb-0" htmlFor={searchId}>Search</label>
          <input
            className="input max-w-xs"
            id={searchId}
            type="search"
            aria-label="Search rows"
            placeholder="Search rows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500" aria-live="polite">
          Showing {total === 0 ? 0 : start + 1}–{start + visible.length} of {total}
        </p>
      </div>
      {error && <p className="p-4 text-sm text-red-600" role="alert">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {columns.map((c) => <th className="p-3" key={c}>{columnLabel(c)}</th>)}
            {actions && <th className="p-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td className="p-4 text-sm text-slate-500" colSpan={colSpan}>Loading…</td></tr>
          ) : visible.length === 0 ? (
            <tr><td className="p-4 text-sm text-slate-500" colSpan={colSpan}>
              {query ? "No matching records." : "No records found."}
            </td></tr>
          ) : visible.map((row, i) => {
            const key = row.id ?? `${start + i}`;
            const detail = details?.(row);
            return (
              <FragmentRow
                key={key}
                row={row}
                columns={columns}
                colSpan={colSpan}
                actions={actions}
                detail={detail}
                refresh={() => { void refresh(); }}
              />
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
        <p className="text-xs text-slate-500">Page {current} of {pageCount}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={current <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={current >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/** Two <tr> elements need a wrapper, so keep them in a tiny fragment. */
function FragmentRow({ row, columns, colSpan, actions, detail, refresh }: {
  row: TableRow;
  columns: string[];
  colSpan: number;
  actions?: (row: TableRow, refresh: () => void) => React.ReactNode;
  detail?: React.ReactNode;
  refresh: () => void;
}) {
  return (
    <>
      <tr className="border-t">
        {columns.map((c) => <td className="max-w-xs truncate p-3" key={c}>{cellValue(c, readValue(row, c))}</td>)}
        {actions && <td className="p-3">{actions(row, refresh)}</td>}
      </tr>
      {detail !== null && detail !== undefined && (
        <tr className="border-t bg-slate-50/60">
          <td className="p-3 text-sm" colSpan={colSpan}>{detail}</td>
        </tr>
      )}
    </>
  );
}

export function ActionButton({ endpoint, method = "PATCH", body, label, onDone, onError, disabled }: {
  endpoint: string;
  method?: string;
  /** A function is evaluated at click time (e.g. to read a reason input). */
  body?: unknown | (() => unknown);
  label: string;
  onDone: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost mr-1 px-2 py-1 text-xs"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          const payload = typeof body === "function" ? (body as () => unknown)() : body;
          await apiFetch(endpoint, { method, body: JSON.stringify(payload ?? {}) });
          onDone();
        } catch (e) {
          onError?.((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
