import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export const metadata = { title: "Payment history" };
export default async function PaymentHistoryPage() {
  const user = await getCurrentUser();
  const { data } = await getSupabaseAdmin().from("payments")
    .select("id,amount,currency,credits_used,status,receipt_url,stripe_payment_intent_id,created_at,orders(order_number,products(title))")
    .eq("user_id", user!.id).order("created_at", { ascending: false });
  return <><h1 className="text-2xl font-bold">Payment history</h1><div className="card mt-6 overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Order</th><th className="p-3">Product</th><th className="p-3">Card amount</th><th className="p-3">Credits</th><th className="p-3">Status</th><th className="p-3">Receipt</th></tr></thead>
    <tbody>{(data ?? []).map((p: any) => <tr key={p.id} className="border-t"><td className="p-3">{p.orders?.order_number}</td><td className="p-3">{p.orders?.products?.title}</td><td className="p-3">${(Number(p.amount)/100).toFixed(2)}</td><td className="p-3">{p.credits_used}</td><td className="p-3 capitalize">{p.status}</td><td className="p-3">{p.receipt_url ? <a className="text-brand-600" href={p.receipt_url}>View</a> : "—"}</td></tr>)}</tbody>
  </table></div></>;
}
