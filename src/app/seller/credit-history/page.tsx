import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export default async function SellerCreditHistory() {
  const user = await getCurrentUser();
  const { data } = await getSupabaseAdmin().from("credit_transactions").select("*").eq("user_id",user!.id).order("created_at",{ascending:false});
  return <><h1 className="text-2xl font-bold">Credit history</h1><div className="card mt-6 divide-y">{(data??[]).map(t=><div key={t.id} className="flex justify-between p-4 text-sm"><span>{t.transaction_type} · {t.reason}</span><span>{t.amount} ({t.balance_after})</span></div>)}</div></>;
}
