import Link from "next/link";

const buyerLinks = [
  ["/buyer/dashboard", "Overview"], ["/buyer/purchases", "Purchases"], ["/buyer/downloads", "Downloads"],
  ["/buyer/payments", "Payment history"], ["/buyer/credits", "Credit wallet"], ["/buyer/credit-history", "Credit history"],
];
const sellerLinks = [
  ["/seller/dashboard", "Overview"], ["/seller/products", "My products"], ["/seller/upload", "Upload product"],
  ["/seller/sales", "Sales"], ["/seller/earnings", "Earnings"], ["/seller/payouts", "Payouts"],
];
const adminLinks = [
  ["/admin", "Overview"], ["/admin/products", "Products"], ["/admin/sellers", "Sellers"],
  ["/admin/orders", "Orders"], ["/admin/payments", "Payments"], ["/admin/refunds", "Refunds"],
  ["/admin/credits", "Credits"], ["/admin/reports", "Reports"], ["/admin/audit-logs", "Audit logs"],
  ["/admin/settings", "Settings"],
];

export function DashboardNav({ area }: { area: "buyer" | "seller" | "admin" }) {
  const links = area === "buyer" ? buyerLinks : area === "seller" ? sellerLinks : adminLinks;
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
      <p className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{area} area</p>
      <nav className="space-y-1">
        {links.map(([href, label]) => <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600">{label}</Link>)}
      </nav>
    </aside>
  );
}

export function DashboardShell({ area, title, children }: { area: "buyer" | "seller" | "admin"; title: string; children: React.ReactNode }) {
  return (
    <div className="container-page flex gap-8 py-10">
      <DashboardNav area={area} />
      <div className="min-w-0 flex-1"><h1 className="mb-6 text-2xl font-bold">{title}</h1>{children}</div>
    </div>
  );
}
