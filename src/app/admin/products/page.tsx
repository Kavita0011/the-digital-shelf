"use client";
import { AdminTable, ActionButton } from "@/components/admin-table";
import { apiFetch } from "@/lib/client-api";
export default function AdminProducts() {
  return <>
    <div className="mb-4 flex items-center justify-between"><p className="text-sm text-slate-500">Approve only after verifying the malware scan result.</p></div>
    <AdminTable endpoint="/api/admin/products" columns={["title","status","price","created_at"]} actions={(row,refresh)=><>
      {row.status==="pending_review" && <ActionButton endpoint={`/api/admin/products/${row.id}/approve`} label="Approve" onDone={refresh} />}
      {row.status==="pending_review" && <ActionButton endpoint={`/api/admin/products/${row.id}/reject`} body={{reason:"Does not meet quality guidelines"}} label="Reject" onDone={refresh} />}
      {row.status==="approved" && <ActionButton endpoint={`/api/admin/products/${row.id}/hide`} label="Hide" onDone={refresh} />}
      {["hidden","approved"].includes(row.status) && <ActionButton endpoint={`/api/admin/products/${row.id}/remove`} label="Remove" onDone={refresh} />}
      {["hidden","removed","rejected"].includes(row.status) && <ActionButton endpoint={`/api/admin/products/${row.id}/restore`} label="Restore" onDone={refresh} />}
    </>} />
  </>;
}
