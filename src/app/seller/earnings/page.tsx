import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export default async function EarningsPage() {
  const user = await getCurrentUser();
  const { data: seller } = await getSupabaseAdmin().from("seller_profiles").select("id").eq("user_id", user!.id).single();
  const { data } = await getSupabaseAdmin().from("orders").select("seller_earnings,platform_commission,payment_status").eq("seller_id", seller?.id ?? "").eq("payment_status","paid");
  const gross = (data??[]).reduce((s,o)=>s+Number(o.seller_earnings)+Number(o.platform_commission),0);
  const net = (data??[]).reduce((s,o)=>s+Number(o.seller_earnings),0);
  return <><h1 className="text-2xl font-bold">Earnings</h1><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="card p-5"><p className="text-sm text-slate-500">Gross sales</p><p className="text-2xl font-bold">${(gross/100).toFixed(2)}</p></div><div className="card p-5"><p className="text-sm text-slate-500">Net earnings</p><p className="text-2xl font-bold">${(net/100).toFixed(2)}</p></div></div></>;
}
