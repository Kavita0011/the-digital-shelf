"use client";
import { AdminTable } from "@/components/admin-table";
export default function AdminRefunds() { return <><p className="mb-4 text-sm text-slate-500">Issue refunds from an order's detail view using /api/admin/refunds.</p><AdminTable endpoint="/api/admin/payments" columns={["order_id","amount","status","created_at"]} /></>; }
