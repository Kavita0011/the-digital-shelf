"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

export type TableRow = { id?: string } & Record<string, unknown>;

interface Props {
  endpoint: string;
  columns: string[];
  actions?: (row: TableRow, refresh: () => void) => React.ReactNode;
}

export function AdminTable({ endpoint, columns, actions }: Props) {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setRows(await apiFetch<TableRow[]>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [endpoint]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="card overflow-x-auto">
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {columns.map((c) => <th className="p-3" key={c}>{c}</th>)}
            {actions && <th className="p-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr className="border-t" key={row.id ?? i}>
              {columns.map((c) => <td className="max-w-xs truncate p-3" key={c}>{String(row[c] ?? "—")}</td>)}
              {actions && <td className="p-3">{actions(row, () => { void refresh(); })}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActionButton({ endpoint, method = "PATCH", body, label, onDone }: {
  endpoint: string;
  method?: string;
  body?: unknown;
  label: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-ghost mr-1 px-2 py-1 text-xs"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(endpoint, { method, body: JSON.stringify(body ?? {}) });
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </button>
  );
}
