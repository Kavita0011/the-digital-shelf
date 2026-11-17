import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import Link from "next/link";

export default async function BuyerDashboard() {
  const user = await getCurrentUser();
  const db = getSupabaseAdmin();
  const [orders, wallet] = await Promise.all([
    db.from("orders").select("id,order_number,total_paid,payment_status,created_at", { count: "exact" }).eq("buyer_id", user!.id).order("created_at", { ascending: false }).limit(5),
    db.from("credit_wallets").select("balance,pending_balance").eq("user_id", user!.id).single(),
  ]);
  return (
    <>
      <h1 className="text-2xl font-bold">Welcome, {user!.fullName ?? user!.email}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-sm text-slate-500">Orders</p><p className="mt-1 text-2xl font-bold">{orders.count ?? 0}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Credit balance</p><p className="mt-1 text-2xl font-bold">{wallet.data?.balance ?? 0}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Pending credits</p><p className="mt-1 text-2xl font-bold">{wallet.data?.pending_balance ?? 0}</p></div>
      </div>
      <div className="card mt-6 p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent purchases</h2><Link className="text-sm text-brand-600" href="/buyer/purchases">View all</Link></div>
        {(orders.data ?? []).map((o) => <div key={o.id} className="flex justify-between border-t py-3 text-sm"><span>{o.order_number}</span><span className="capitalize">{o.payment_status}</span></div>)}
        {(orders.data ?? []).length === 0 && <p className="text-sm text-slate-500">No purchases yet.</p>}
      </div>
    </>
  );
}
