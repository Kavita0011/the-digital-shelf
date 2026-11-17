import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export const metadata = { title: "Downloads" };
export default async function DownloadsPage() {
  const user = await getCurrentUser();
  const { data } = await getSupabaseAdmin().from("downloads")
    .select("id,downloaded_at,expires_at,products(title),orders(order_number)")
    .eq("user_id", user!.id).order("expires_at", { ascending: false }).limit(100);
  return <><h1 className="text-2xl font-bold">Download history</h1><div className="card mt-6 divide-y">{(data ?? []).map((d: any) => (
    <div key={d.id} className="flex justify-between p-4 text-sm"><span>{d.products?.title}</span><span className="text-slate-500">{d.downloaded_at ? `Downloaded ${new Date(d.downloaded_at).toLocaleString()}` : `Token expires ${new Date(d.expires_at).toLocaleString()}`}</span></div>
  ))}</div></>;
}
