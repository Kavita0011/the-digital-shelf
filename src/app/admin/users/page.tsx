import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { UserRoleManager } from "@/components/user-role-manager";
import type { Role, UserStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  fullName: string | null;
}

export default async function AdminUsersPage() {
  const admin = await getCurrentUser();
  if (!admin || (admin.realRole !== "admin" && admin.realRole !== "super_admin") || admin.impersonating) redirect("/admin");

  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id,email,role,status,full_name")
    .order("created_at", { ascending: false })
    .limit(200);

  const users: ManagedUser[] = (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    role: row.role as Role,
    status: row.status as UserStatus,
    fullName: row.full_name ? String(row.full_name) : null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Users and roles</h1>
      <p className="mt-2 text-sm text-slate-600">
        Change roles, suspend or ban access, revoke elevated permissions, or delete accounts here. You cannot target your own account or another super admin.
      </p>
      <UserRoleManager
        users={users}
        currentUserId={admin.id}
        canChangeRoles={admin.realRole === "super_admin"}
      />
    </div>
  );
}
