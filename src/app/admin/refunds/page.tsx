"use client";
import { AdminTable } from "@/components/admin-table";
export default function AdminRefunds() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Refunds</h1>
      <p className="text-sm text-slate-500">
        Refunds issued from Stripe appear here. Use the refund API with an order ID and reason to issue a new refund.
      </p>
      <AdminTable
        endpoint="/api/admin/refunds"
        columns={["order_id", "amount", "reason", "status", "stripe_refund_id", "created_at"]}
      />
    </div>
  );
}
