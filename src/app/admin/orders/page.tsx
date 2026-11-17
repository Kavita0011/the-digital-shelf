"use client";
import { AdminTable } from "@/components/admin-table";
export default function AdminOrders() { return <AdminTable endpoint="/api/admin/payments" columns={["order_id","user_id","amount","status","created_at"]} />; }
