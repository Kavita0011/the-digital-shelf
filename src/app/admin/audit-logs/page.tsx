"use client";
import { AdminTable } from "@/components/admin-table";
export default function AuditLogs() { return <AdminTable endpoint="/api/admin/audit-logs" columns={["created_at","actor_role","action","target_type","target_id"]} />; }
