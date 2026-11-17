"use client";
import { AdminTable, ActionButton } from "@/components/admin-table";

export default function AdminProducts() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Approve only after verifying the malware scan result.</p>
      </div>
      <AdminTable
        endpoint="/api/admin/products"
        columns={["title", "status", "price", "created_at"]}
        actions={(row, refresh) => {
          const id = String(row.id ?? "");
          const status = String(row.status ?? "");
          if (!id) return null;
          return (
            <>
              {status === "pending_review" && <ActionButton endpoint={`/api/admin/products/${id}/approve`} label="Approve" onDone={refresh} />}
              {status === "pending_review" && <ActionButton endpoint={`/api/admin/products/${id}/reject`} body={{ reason: "Does not meet quality guidelines" }} label="Reject" onDone={refresh} />}
              {status === "approved" && <ActionButton endpoint={`/api/admin/products/${id}/hide`} label="Hide" onDone={refresh} />}
              {["hidden", "approved"].includes(status) && <ActionButton endpoint={`/api/admin/products/${id}/remove`} label="Remove" onDone={refresh} />}
              {["hidden", "removed", "rejected"].includes(status) && <ActionButton endpoint={`/api/admin/products/${id}/restore`} label="Restore" onDone={refresh} />}
            </>
          );
        }}
      />
    </>
  );
}
