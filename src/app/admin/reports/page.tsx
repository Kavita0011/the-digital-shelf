"use client";
import { AdminTable, ActionButton } from "@/components/admin-table";
import { apiFetch } from "@/lib/client-api";

export default function AdminReports() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <AdminTable
        endpoint="/api/admin/reports"
        columns={["reason", "details", "status", "created_at"]}
        actions={(row, refresh) => (
          <>
            <ActionButton endpoint={`/api/admin/products/${row.product_id}/hide`} label="Hide product" onDone={refresh} />
            <button
              className="btn-ghost px-2 py-1 text-xs"
              disabled={row.status === "resolved" || row.status === "dismissed"}
              onClick={async () => {
                if (!window.confirm("Mark this report as resolved?")) return;
                await apiFetch("/api/admin/reports", {
                  method: "PATCH",
                  body: JSON.stringify({ id: row.id, status: "resolved" }),
                });
                refresh();
              }}
            >
              Resolve report
            </button>
          </>
        )}
      />
    </div>
  );
}
