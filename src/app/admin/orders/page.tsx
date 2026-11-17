"use client";
import { AdminTable } from "@/components/admin-table";
export default function AdminOrders() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <AdminTable
        endpoint="/api/admin/orders"
        columns={["order_number", "buyer_id", "total_paid", "payment_status", "created_at"]}
      />
    </div>
  );
}
