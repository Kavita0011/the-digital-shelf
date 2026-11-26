import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DownloadLink } from "@/components/download-link";
import { contentTypeLabel } from "@/lib/types";

interface BuyerOrder {
  id: string;
  order_number: string;
  total_paid: number;
  payment_status: string;
  created_at: string;
  products: { title: string; slug: string; content_type: string | null; file_format: string | null } | null;
}

export default async function BuyerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const [orders, wallet] = await Promise.all([
    db.from("orders")
      .select("id,order_number,total_paid,payment_status,created_at,products(title,slug,content_type,file_format)")
      .eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(20),
    db.from("credit_wallets").select("balance,pending_balance").eq("user_id", user.id).single(),
  ]);
  const rows = (orders.data ?? []) as unknown as BuyerOrder[];
  const ownedProducts = rows.filter((o) => o.payment_status === "paid" && o.products);

  return (
    <>
      <h1 className="text-2xl font-bold">Welcome, {user.fullName ?? user.email}</h1>
      <p className="mt-1 text-sm text-slate-500">Your purchased products are front and center. Seller and account details stay out of the way.</p>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Your products</h2>
          <Link className="text-sm font-semibold text-brand-600" href="/buyer/purchases">View all purchases →</Link>
        </div>
        {ownedProducts.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No paid products yet. <Link className="font-semibold text-brand-600" href="/products">Browse the shelf</Link> to find your first one.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ownedProducts.slice(0, 6).map((o) => (
              <div key={o.id} className="card p-5">
                <span className="badge bg-brand-600/10 text-brand-700">{contentTypeLabel(o.products?.content_type)}</span>
                <h3 className="mt-2 font-semibold">
                  <Link className="hover:text-brand-600" href={`/products/${o.products?.slug}`}>{o.products?.title}</Link>
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {o.products?.file_format ? `${String(o.products.file_format).toUpperCase()} · ` : ""}Order {o.order_number}
                </p>
                <div className="mt-4 flex gap-4 text-sm font-semibold text-brand-600">
                  <DownloadLink orderId={o.id} />
                  <Link className="hover:underline" href={`/invoices/${o.id}`}>Invoice</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Account snapshot</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5"><p className="text-sm text-slate-500">Paid orders</p><p className="mt-1 text-2xl font-bold">{ownedProducts.length}</p></div>
          <div className="card p-5"><p className="text-sm text-slate-500">Credit balance</p><p className="mt-1 text-2xl font-bold">{wallet.data?.balance ?? 0}</p></div>
          <div className="card p-5"><p className="text-sm text-slate-500">Pending credits</p><p className="mt-1 text-2xl font-bold">{wallet.data?.pending_balance ?? 0}</p></div>
        </div>
        <div className="card mt-4 p-5">
          <h3 className="text-sm font-semibold">Recent order activity</h3>
          {rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">No orders yet.</p> : (
            <div className="mt-2 divide-y">
              {rows.slice(0, 5).map((o) => (
                <div key={o.id} className="flex justify-between py-2 text-sm">
                  <span>{o.order_number}</span><span className="capitalize text-slate-500">{o.payment_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
