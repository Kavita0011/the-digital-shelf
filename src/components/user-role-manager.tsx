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

type Action = "suspend" | "ban" | "activate" | "revoke" | "delete";

const ACTION_LABELS: Record<Action, string> = {
  suspend: "Suspend",
  ban: "Ban",
  activate: "Activate",
  revoke: "Revoke access",
  delete: "Delete",
};

const ROLE_RANK: Record<Role, number> = { buyer: 0, seller: 1, admin: 2, super_admin: 3 };

export function UserRoleManager({
  users: initialUsers,
  currentUserId,
  canChangeRoles = false,
}: {
  users: ManagedUser[];
  currentUserId: string;
  canChangeRoles?: boolean;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  function canManage(user: ManagedUser): boolean {
    return user.id !== currentUserId
      && user.role !== "super_admin"
      && user.status !== "deleted"
      && ROLE_RANK[user.role] < ROLE_RANK.super_admin;
  }

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

  async function runAction(user: ManagedUser, action: Action) {
    if (action === "delete" && !window.confirm(`Delete ${user.email}? This revokes access permanently and cannot be undone.`)) return;
    if (action === "revoke" && !window.confirm(`Revoke all elevated access for ${user.email}?`)) return;

    setBusyId(user.id); setMessage("");
    try {
      if (action === "delete") {
        await apiFetch(`/api/admin/users/${user.id}/delete`, {
          method: "POST",
          body: JSON.stringify({ confirm: "DELETE" }),
        });
        setUsers((current) => current.map((item) => item.id === user.id
          ? { ...item, role: "buyer", status: "deleted", fullName: null, email: `deleted-${item.id}@invalid.local` }
          : item));
        setMessage(`Deleted ${user.email}.`);
      } else if (action === "revoke") {
        await apiFetch(`/api/admin/users/${user.id}/revoke-permissions`, { method: "POST" });
        setUsers((current) => current.map((item) => item.id === user.id
          ? { ...item, role: "buyer", status: "suspended" }
          : item));
        setMessage(`Revoked access for ${user.email}.`);
      } else {
        await apiFetch(`/api/admin/users/${user.id}/${action}`, { method: "PATCH" });
        const nextStatus: UserStatus = action === "activate" ? "active" : action === "ban" ? "banned" : "suspended";
        setUsers((current) => current.map((item) => item.id === user.id
          ? { ...item, status: nextStatus }
          : item));
        setMessage(action === "ban" ? `Banned ${user.email}.` : `${ACTION_LABELS[action]}ed ${user.email}.`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mt-6">
      {message && <p className="mb-3 text-sm text-slate-700">{message}</p>}

      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Status</th>
              <th className="p-2">Role</th>
              <th className="p-2">Controls</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const managed = canManage(user);
              return (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-2">
                    <p className="font-medium">{user.fullName || "—"}</p>
                    <p className="text-slate-500">{user.email}</p>
                  </td>
                  <td className="p-2">{user.status}</td>
                  <td className="p-2">
                    <select
                      className="input py-1"
                      value={user.role}
                      disabled={!canChangeRoles || !managed || busyId === user.id}
                      onChange={(event) => void changeRole(user, event.target.value as Role)}
                    >
                      {ROLES.filter((role) => role !== "super_admin").map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                      {user.role === "super_admin" && <option value="super_admin">super_admin</option>}
                    </select>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(["activate", "suspend", "ban", "revoke", "delete"] as const).map((action) => (
                        <button
                          key={action}
                          type="button"
                          className={`rounded border px-2 py-1 text-xs ${action === "delete" || action === "ban" ? "border-red-200 text-red-600" : "border-slate-200 text-slate-600"}`}
                          disabled={!managed || busyId === user.id}
                          onClick={() => void runAction(user, action)}
                        >
                          {ACTION_LABELS[action]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
