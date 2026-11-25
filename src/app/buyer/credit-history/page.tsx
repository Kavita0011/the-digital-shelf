import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export const metadata = { title: "Credit history" };
export default async function CreditHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data } = await getSupabaseAdmin().from("credit_transactions")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  return <><h1 className="text-2xl font-bold">Credit history</h1><div className="card mt-6 overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="bg-slate-50 text-slate-500"><tr>{["Date","Amount","Type","Before","After","Reason","Status"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead>
    <tbody>{(data ?? []).map((t) => <tr key={t.id} className="border-t"><td className="p-3">{new Date(t.created_at).toLocaleString()}</td><td className="p-3">{t.amount}</td><td className="p-3">{t.transaction_type}</td><td className="p-3">{t.balance_before}</td><td className="p-3">{t.balance_after}</td><td className="p-3">{t.reason}</td><td className="p-3">{t.status}</td></tr>)}</tbody>
  </table></div></>;
}
