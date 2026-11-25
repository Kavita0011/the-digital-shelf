import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/site";
import { MobileNav } from "@/components/mobile-nav";
import { AccountLinks } from "@/components/account-links";
import { NotificationBell } from "@/components/notification-bell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Digital Shelf", template: "%s · The Digital Shelf" },
  description: "A curated marketplace for premium digital products.",
};

const nav = [
  { href: "/products", label: "Browse" },
  { href: "/categories", label: "Categories" },
  { href: "/sell", label: "Sell" },
  { href: "/support", label: "Support" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <header className="relative border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="container-page flex h-16 items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">The Digital Shelf</Link>
            <nav aria-label="Primary" className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
              {nav.map((n) => <Link key={n.href} href={n.href} className="hover:text-brand-600">{n.label}</Link>)}
            </nav>
            <div className="hidden items-center gap-2 md:flex">
              <NotificationBell />
              <AccountLinks />
            </div>
            <MobileNav />
          </div>
        </header>
        <main id="main" className="min-h-[70vh]">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="container-page grid gap-6 py-10 text-sm text-slate-500 sm:grid-cols-4">
            <div><p className="font-semibold text-ink">The Digital Shelf</p><p className="mt-2">Curated digital goods, securely delivered.</p><a className="mt-2 block break-all hover:text-brand-600" href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a></div>
            <div><p className="font-semibold text-ink">Legal</p><Link className="block" href="/terms">Terms</Link><Link className="block" href="/privacy">Privacy</Link><Link className="block" href="/refund-policy">Refunds</Link></div>
            <div><p className="font-semibold text-ink">Sellers</p><Link className="block" href="/upload-safety">Upload safety</Link><Link className="block" href="/sell">Become a seller</Link></div>
            <div><p className="font-semibold text-ink">Account</p><Link className="block" href="/buyer/dashboard">Buyer dashboard</Link><Link className="block" href="/seller/dashboard">Seller dashboard</Link><Link className="block" href="/admin">Admin</Link></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
