"use client";
import { AdminTable, ActionButton } from "@/components/admin-table";
import { apiFetch } from "@/lib/client-api";
export default function AdminReports() {
  return <AdminTable endpoint="/api/admin/reports" columns={["reason","details","status","created_at"]} actions={(row,refresh)=><>
    <ActionButton endpoint={`/api/admin/products/${row.product_id}/hide`} label="Suspend product" onDone={refresh} />
    <button className="btn-ghost px-2 py-1 text-xs" onClick={async()=>{ await apiFetch(`/api/admin/products/${row.product_id}/hide`,{method:"PATCH"}); refresh(); }}>Remove</button>
  </>} />;
}
