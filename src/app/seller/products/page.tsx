import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
const statusColors: Record<string,string> = { draft:"bg-slate-100", scanning:"bg-blue-100", pending_review:"bg-amber-100", approved:"bg-green-100", rejected:"bg-red-100", hidden:"bg-slate-200", removed:"bg-red-200" };
export default async function SellerProducts() {
  const user = await getCurrentUser();
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user!.id).single();
  const { data } = await db.from("products").select("id,title,status,price,rejection_reason,created_at").eq("seller_id", seller?.id ?? "").order("created_at",{ascending:false});
  return <><h1 className="text-2xl font-bold">My products</h1><div className="card mt-6 divide-y">{(data??[]).map(p=><div key={p.id} className="p-4">
    <div className="flex items-center justify-between"><span className="font-medium">{p.title}</span><span className={`badge ${statusColors[p.status] ?? "bg-slate-100"}`}>{p.status.replace("_"," ")}</span></div>
    <p className="mt-1 text-sm text-slate-500">${(Number(p.price)/100).toFixed(2)} {p.rejection_reason && `· ${p.rejection_reason}`}</p>
  </div>)}</div></>;
}
