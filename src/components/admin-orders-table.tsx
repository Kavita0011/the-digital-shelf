"use client";

import Link from "next/link";
import { AdminTable, type TableRow } from "@/components/admin-table";

export function AdminOrdersTable() {
  return (
    <AdminTable
      endpoint="/api/admin/orders"
      columns={["order_number", "buyer_id", "total_paid", "payment_status", "created_at"]}
      actions={(row: TableRow) => (
        <Link className="text-brand-600 hover:underline" href={`/invoices/${String(row.id ?? "")}`}>
          Invoice
        </Link>
      )}
    />
  );
}
