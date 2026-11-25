"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = "buyer" | "seller" | "admin" | "super_admin";

function dashboardFor(role: Role): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "seller") return "/seller/dashboard";
  return "/buyer/dashboard";
}

/** Session-aware desktop links; hidden until auth state is known to avoid a wrong-state flash. */
export function AccountLinks() {
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        return (json?.data?.user?.role as Role) ?? null;
      })
      .catch(() => null)
      .then((nextRole) => {
        if (!active) return;
        setRole(nextRole);
        setChecked(true);
      });
    return () => { active = false; };
  }, []);

  if (!checked) return null;

  if (role) {
    return (
      <>
        <Link href={dashboardFor(role)} className="btn-ghost">Dashboard</Link>
        <Link href="/buyer/settings" className="btn">Account</Link>
      </>
    );
  }

  return (
    <>
      <Link href="/login" className="btn-ghost">Log in</Link>
      <Link href="/register" className="btn">Get started</Link>
    </>
  );
}
