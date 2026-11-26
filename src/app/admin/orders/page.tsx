import { AdminOrdersTable } from "@/components/admin-orders-table";

export const metadata = { title: "Admin orders" };

export default function AdminOrders() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <AdminOrdersTable />
    </div>
  );
}
