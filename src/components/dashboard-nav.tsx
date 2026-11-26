import Link from "next/link";

const buyerLinks = [
  ["/buyer/purchases", "My products"], ["/buyer/downloads", "Downloads"], ["/products", "Browse products"],
  ["/buyer/dashboard", "Overview"], ["/buyer/payments", "Payment history"], ["/buyer/credits", "Credit wallet"],
  ["/buyer/credit-history", "Credit history"], ["/buyer/settings", "Settings"], ["/notifications", "Notifications"],
];
const sellerLinks = [
  ["/seller/dashboard", "Overview"], ["/seller/products", "My products"], ["/seller/upload", "Upload product"],
  ["/seller/sales", "Sales"], ["/seller/earnings", "Earnings"], ["/seller/payouts", "Payouts"],
  ["/seller/settings", "Settings"], ["/notifications", "Notifications"],
];
const adminLinks = [
  ["/admin", "Overview"], ["/admin/users", "Users"], ["/admin/products", "Products"], ["/admin/sellers", "Sellers"],
  ["/admin/orders", "Orders"], ["/admin/payments", "Payments"], ["/admin/refunds", "Refunds"],
  ["/admin/credits", "Credits"], ["/admin/reports", "Reports"], ["/admin/audit-logs", "Audit logs"],
  ["/admin/settings", "Settings"], ["/notifications", "Notifications"],
];

export function DashboardNav({ area, isImpersonating = false }: { area: "buyer" | "seller" | "admin"; isImpersonating?: boolean }) {
  const baseLinks = area === "buyer" ? buyerLinks : area === "seller" ? sellerLinks : adminLinks;
  const links = isImpersonating && area === "admin"
    ? baseLinks.filter(([href]) => href !== "/admin/users")
    : baseLinks;
  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 md:w-56 md:border-b-0 md:border-r">
      <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{area} area</p>
      <nav aria-label={`${area} navigation`} className="flex gap-1 overflow-x-auto md:block md:space-y-1">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600 md:block">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function DashboardShell({ area, title, children }: { area: "buyer" | "seller" | "admin"; title: string; children: React.ReactNode }) {
  return (
    <div className="container-page flex flex-col gap-8 py-10 md:flex-row">
      <DashboardNav area={area} />
      <div className="min-w-0 flex-1"><h1 className="mb-6 text-2xl font-bold">{title}</h1>{children}</div>
    </div>
  );
}
