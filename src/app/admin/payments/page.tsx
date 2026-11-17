"use client";
import { AdminTable } from "@/components/admin-table";
export default function AdminPayments() { return <AdminTable endpoint="/api/admin/payments" columns={["id","order_id","user_id","amount","credits_used","status","created_at"]} />; }
