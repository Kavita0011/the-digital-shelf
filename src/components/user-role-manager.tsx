"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { ROLES, type Role, type UserStatus } from "@/lib/types";

interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  fullName: string | null;
}

type ViewRole = "buyer" | "seller" | "admin";

export function UserRoleManager({ users: initialUsers }: { users: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function changeRole(user: ManagedUser, role: Role) {
    setBusyId(user.id); setMessage("");
    try {
      await apiFetch(`/api/admin/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, role } : item));
      setMessage(`Updated ${user.email} to ${role}.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyId("");
    }
  }

  async function viewAs(role: ViewRole) {
    setBusyId(`view-${role}`); setMessage("");
    try {
      await apiFetch("/api/admin/impersonate", { method: "POST", body: JSON.stringify({ role }) });
      window.location.href = role === "buyer" ? "/buyer/dashboard" : role === "seller" ? "/seller/dashboard" : "/admin";
    } catch (error) {
      setMessage((error as Error).message);
      setBusyId("");
    }
  }

  return (
    <div className="mt-6">
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <span className="text-sm font-medium">Temporarily view the site as:</span>
        <button className="btn-ghost" disabled={Boolean(busyId)} onClick={() => viewAs("buyer")}>Buyer</button>
        <button className="btn-ghost" disabled={Boolean(busyId)} onClick={() => viewAs("seller")}>Seller</button>
        <button className="btn-ghost" disabled={Boolean(busyId)} onClick={() => viewAs("admin")}>Admin</button>
        <span className="ml-auto text-xs text-slate-500">Your real account stays super_admin.</span>
      </div>

      {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}

      <div className="card mt-4 overflow-x-auto p-4">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-2">User</th><th className="p-2">Status</th><th className="p-2">Role</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="p-2"><p className="font-medium">{user.fullName || "—"}</p><p className="text-slate-500">{user.email}</p></td>
                <td className="p-2">{user.status}</td>
                <td className="p-2">
                  <select
                    className="input py-1"
                    value={user.role}
                    disabled={busyId === user.id || user.role === "super_admin"}
                    onChange={(event) => changeRole(user, event.target.value as Role)}
                  >
                    {ROLES.filter((role) => role !== "super_admin").map((role) => <option key={role} value={role}>{role}</option>)}
                    {user.role === "super_admin" && <option value="super_admin">super_admin</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
