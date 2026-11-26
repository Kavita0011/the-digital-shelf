import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata = { title: "Sales" };

interface SaleRow {
  id: string;
  order_number: string;
  total_paid: number;
  seller_earnings: number;
  platform_commission: number;
  payment_status: string;
  products: { title: string } | null;
}

export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data: seller } = await getSupabaseAdmin()
    .from("seller_profiles").select("id").eq("user_id", user.id).single();
  if (!seller) redirect("/sell");
  const { data } = await getSupabaseAdmin().from("orders")
    .select("id,order_number,total_paid,seller_earnings,platform_commission,payment_status,products(title)")
    .eq("seller_id", seller.id).order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as SaleRow[];
  const columns = ["Order", "Product", "Gross", "Commission", "Net", "Status", "Invoice"];
  return (
    <>
      <h1 className="text-2xl font-bold">Sales</h1>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{columns.map((h) => <th className="p-3" key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr className="border-t" key={o.order_number}>
                <td className="p-3">{o.order_number}</td>
                <td className="p-3">{o.products?.title ?? "Product"}</td>
                <td className="p-3">${(Number(o.total_paid) / 100).toFixed(2)}</td>
                <td className="p-3">${(Number(o.platform_commission) / 100).toFixed(2)}</td>
                <td className="p-3">${(Number(o.seller_earnings) / 100).toFixed(2)}</td>
                <td className="p-3 capitalize">{o.payment_status}</td>
                <td className="p-3"><Link className="text-brand-600 hover:underline" href={`/invoices/${o.id}`}>Invoice</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
