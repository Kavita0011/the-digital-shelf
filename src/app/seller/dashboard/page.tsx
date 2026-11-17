import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export default async function SellerDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id,upload_limit,verification_status").eq("user_id", user!.id).single();
  const { data: products } = await db.from("products").select("status").eq("seller_id", seller?.id ?? "");
  const { data: orders } = await db.from("orders").select("seller_earnings,payment_status").eq("seller_id", seller?.id ?? "");
  return <>
    <h1 className="text-2xl font-bold">Seller overview</h1>
    <p className="mt-1 text-sm text-slate-500">Verification: <span className="capitalize">{seller?.verification_status ?? "none"}</span></p>
    <div className="mt-6 grid gap-4 sm:grid-cols-4">
      <div className="card p-5"><p className="text-sm text-slate-500">Products</p><p className="text-2xl font-bold">{products?.length ?? 0}</p></div>
      <div className="card p-5"><p className="text-sm text-slate-500">Pending review</p><p className="text-2xl font-bold">{products?.filter(p=>p.status==="pending_review").length ?? 0}</p></div>
      <div className="card p-5"><p className="text-sm text-slate-500">Sales</p><p className="text-2xl font-bold">{orders?.length ?? 0}</p></div>
      <div className="card p-5"><p className="text-sm text-slate-500">Earnings (cents)</p><p className="text-2xl font-bold">{orders?.reduce((s,o)=>s+Number(o.seller_earnings),0) ?? 0}</p></div>
    </div>
    <p className="mt-6 text-sm text-slate-500">Upload limit: {seller?.upload_limit ?? 0} products</p>
  </>;
}
