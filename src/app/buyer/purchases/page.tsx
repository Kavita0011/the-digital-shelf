import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DownloadLink } from "@/components/download-link";

export const metadata = { title: "Purchases" };

interface PurchaseRow {
  id: string;
  order_number: string;
  total_paid: number;
  payment_status: string;
  products: { title: string; slug: string } | null;
}

export default async function PurchasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data } = await getSupabaseAdmin().from("orders")
    .select("id,order_number,total_paid,payment_status,products(title,slug)")
    .eq("buyer_id", user.id).order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as PurchaseRow[];
  return (
    <>
      <h1 className="text-2xl font-bold">Purchases</h1>
      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr><th className="p-3">Order</th><th className="p-3">Product</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Invoice</th><th className="p-3">Download</th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-3">{o.order_number}</td>
                <td className="p-3">{o.products?.title ?? "Product"}</td>
                <td className="p-3">${(Number(o.total_paid) / 100).toFixed(2)}</td>
                <td className="p-3 capitalize">{o.payment_status}</td>
                <td className="p-3"><Link className="text-brand-600 hover:underline" href={`/invoices/${o.id}`}>Invoice</Link></td>
                <td className="p-3">{o.payment_status === "paid" ? <DownloadLink orderId={o.id} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
