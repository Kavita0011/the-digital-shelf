import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CreditPackPicker } from "@/components/credit-purchase-button";

export const metadata = { title: "Credit wallet" };

export default async function CreditsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data: wallet } = await getSupabaseAdmin().from("credit_wallets")
    .select("balance,pending_balance,frozen_balance,currency").eq("user_id", user.id).single();
  return <>
    <h1 className="text-2xl font-bold">Credit wallet</h1>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="card p-5"><p className="text-sm text-slate-500">Available</p><p className="text-2xl font-bold">{wallet?.balance ?? 0}</p></div>
      <div className="card p-5"><p className="text-sm text-slate-500">Pending</p><p className="text-2xl font-bold">{wallet?.pending_balance ?? 0}</p></div>
      <div className="card p-5"><p className="text-sm text-slate-500">Frozen</p><p className="text-2xl font-bold">{wallet?.frozen_balance ?? 0}</p></div>
    </div>
    <div className="card mt-6 p-5">
      <h2 className="font-semibold">Buy credits</h2>
      <p className="mt-1 text-sm text-slate-500">1 credit = $0.01. Credits may be used at checkout.</p>
      <div className="mt-4"><CreditPackPicker /></div>
    </div>
  </>;
}
