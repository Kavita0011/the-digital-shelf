"use client";
import { AdminTable, ActionButton } from "@/components/admin-table";
export default function AdminSellers() {
  return <AdminTable endpoint="/api/admin/sellers" columns={["store_name","verification_status","payout_status","upload_limit","created_at"]} actions={(row,refresh)=><>
    <ActionButton endpoint={`/api/admin/sellers/${row.id}/verify`} body={{status:"approved"}} label="Approve" onDone={refresh} />
    <ActionButton endpoint={`/api/admin/sellers/${row.id}/verify`} body={{status:"rejected"}} label="Reject" onDone={refresh} />
  </>} />;
}
