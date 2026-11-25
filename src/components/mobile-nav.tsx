"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Role = "buyer" | "seller" | "admin" | "super_admin";

function dashboardFor(role: Role): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "seller") return "/seller/dashboard";
  return "/buyer/dashboard";
}

/** Compact menu for small screens; the desktop nav is rendered in the layout. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        return (json?.data?.user?.role as Role) ?? null;
      })
      .catch(() => null)
      .then((nextRole) => { if (active) setRole(nextRole); });
    return () => { active = false; };
  }, []);

  const links = [
    { href: "/products", label: "Browse" },
    { href: "/categories", label: "Categories" },
    { href: "/sell", label: "Sell" },
    { href: "/support", label: "Support" },
    role
      ? { href: dashboardFor(role), label: "Dashboard" }
      : { href: "/login", label: "Log in" },
  ];

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="btn-ghost px-3 py-2"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="absolute inset-x-0 top-16 z-50 border-b border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50" onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            ))}
            <Link href={role ? "/buyer/settings" : "/register"} className="btn mt-2 text-center" onClick={() => setOpen(false)}>
              {role ? "Account" : "Get started"}
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
