import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export default async function SalesPage() {
  const user = await getCurrentUser();
  const { data: seller } = await getSupabaseAdmin().from("seller_profiles").select("id").eq("user_id", user!.id).single();
  const { data } = await getSupabaseAdmin().from("orders")
    .select("order_number,total_paid,seller_earnings,platform_commission,payment_status,paid_at,products(title)")
    .eq("seller_id", seller?.id ?? "").order("created_at",{ascending:false});
  return <><h1 className="text-2xl font-bold">Sales</h1><div className="card mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Order","Product","Gross","Commission","Net","Status"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{(data??[]).map((o:any)=><tr className="border-t" key={o.order_number}><td className="p-3">{o.order_number}</td><td className="p-3">{o.products?.title}</td><td className="p-3">{(Number(o.total_paid)/100).toFixed(2)}</td><td className="p-3">{(Number(o.platform_commission)/100).toFixed(2)}</td><td className="p-3">{(Number(o.seller_earnings)/100).toFixed(2)}</td><td className="p-3">{o.payment_status}</td></tr>)}</tbody></table></div></>;
}
