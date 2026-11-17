"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/products", label: "Browse" },
  { href: "/categories", label: "Categories" },
  { href: "/sell", label: "Sell" },
  { href: "/support", label: "Support" },
  { href: "/login", label: "Log in" },
];

/** Compact menu for small screens; the desktop nav is rendered in the layout. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
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
            <Link href="/register" className="btn mt-2 text-center" onClick={() => setOpen(false)}>Get started</Link>
          </div>
        </nav>
      )}
    </div>
  );
}
