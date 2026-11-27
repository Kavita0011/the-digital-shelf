"use client";
import { useState } from "react";
import { AdminTable, ActionButton, type TableRow } from "@/components/admin-table";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function AdminProducts() {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const reasonFor = (id: string) => reasons[id] ?? "";
  const setReason = (id: string, value: string) => setReasons((prev) => ({ ...prev, [id]: value }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-sm text-slate-500">Approve only after verifying the malware scan result.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <AdminTable
        endpoint="/api/admin/products"
        columns={["title", "seller_profiles.store_name", "content_type", "status", "price", "product_files.scan_status", "created_at"]}
        details={(row: TableRow) => {
          const id = String(row.id ?? "");
          const seller = asRecord(row.seller_profiles);
          const file = asRecord(row.product_files);
          const inputId = `moderation-reason-${id}`;
          return (
            <div className="space-y-2 rounded-lg bg-white p-3 text-xs text-slate-600">
              <p><strong>Seller:</strong> {display(seller.store_name)} · <strong>Featured:</strong> {row.is_featured ? "Yes" : "No"}</p>
              <p>
                <strong>Scan:</strong> {display(file.scan_status)} · <strong>Provider:</strong> {display(file.scan_provider)} ·{" "}
                <strong>Analysis ID:</strong> {display(file.scan_analysis_id)} · <strong>File:</strong> {display(file.original_filename)}
              </p>
              {row.rejection_reason ? <p className="text-red-600"><strong>Rejection reason:</strong> {String(row.rejection_reason)}</p> : null}
              <div>
                <label className="label" htmlFor={inputId}>Moderation reason (5–2000 characters)</label>
                <textarea
                  className="input"
                  id={inputId}
                  rows={2}
                  placeholder="Explain what the seller needs to change"
                  value={reasonFor(id)}
                  onChange={(e) => setReason(id, e.target.value)}
                />
              </div>
            </div>
          );
        }}
        actions={(row: TableRow, refresh) => {
          const id = String(row.id ?? "");
          if (!id) return null;
          const status = String(row.status ?? "");
          const reason = reasonFor(id).trim();
          const reasonReady = reason.length >= 5 && reason.length <= 2000;
          const onError = (message: string) => setError(message);
          const reasonBody = () => ({ reason });
          return (
            <div className="flex flex-wrap gap-1">
              {["pending_review", "hidden", "removed"].includes(status) && (
                <ActionButton endpoint={`/api/admin/products/${id}/approve`} label="Approve" onDone={refresh} onError={onError} />
              )}
              {status === "pending_review" && (
                <ActionButton endpoint={`/api/admin/products/${id}/reject`} body={reasonBody} label="Reject" disabled={!reasonReady} onDone={refresh} onError={onError} />
              )}
              {["pending_review", "approved", "hidden", "removed"].includes(status) && (
                <ActionButton endpoint={`/api/admin/products/${id}/request-changes`} body={reasonBody} label="Request changes" disabled={!reasonReady} onDone={refresh} onError={onError} />
              )}
              {status === "approved" && (
                <>
                  <ActionButton
                    endpoint={`/api/admin/products/${id}/feature`}
                    body={{ featured: !row.is_featured }}
                    label={row.is_featured ? "Unfeature" : "Feature"}
                    onDone={refresh}
                    onError={onError}
                  />
                  <ActionButton endpoint={`/api/admin/products/${id}/hide`} label="Hide" onDone={refresh} onError={onError} />
                </>
              )}
              {["hidden", "approved"].includes(status) && (
                <ActionButton endpoint={`/api/admin/products/${id}/remove`} label="Remove" onDone={refresh} onError={onError} />
              )}
              {["hidden", "removed", "rejected"].includes(status) && (
                <ActionButton endpoint={`/api/admin/products/${id}/restore`} label="Restore" onDone={refresh} onError={onError} />
              )}
              {!reasonReady && ["pending_review", "approved", "hidden", "removed"].includes(status) && (
                <span className="sr-only" aria-live="polite">Enter a reason of at least 5 characters to reject or request changes.</span>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
