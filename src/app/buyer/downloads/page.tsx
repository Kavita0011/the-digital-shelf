import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DownloadLink } from "@/components/download-link";
import { contentTypeLabel } from "@/lib/types";

export const metadata = { title: "Downloads" };

interface DownloadRow {
  id: string;
  order_id: string;
  downloaded_at: string | null;
  expires_at: string;
  products: { title: string; slug: string; content_type: string | null; file_format: string | null } | null;
  orders: { order_number: string } | null;
}

export default async function DownloadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data } = await getSupabaseAdmin().from("downloads")
    .select("id,order_id,downloaded_at,expires_at,products(title,slug,content_type,file_format),orders(order_number)")
    .eq("user_id", user.id).order("expires_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as DownloadRow[];

  return (
    <>
      <h1 className="text-2xl font-bold">My downloads</h1>
      <p className="mt-1 text-sm text-slate-500">A product-first view of every file link you have requested.</p>
      {rows.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="font-semibold">No downloads yet.</p>
          <p className="mt-1 text-sm text-slate-500">Buy a product, then use the download link in your purchases.</p>
          <Link className="btn mt-4" href="/buyer/purchases">View purchases</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {rows.map((d) => (
            <article key={d.id} className="card p-5">
              <span className="badge bg-brand-600/10 text-brand-700">{contentTypeLabel(d.products?.content_type)}</span>
              <h2 className="mt-2 font-semibold">
                {d.products ? <Link className="hover:text-brand-600" href={`/products/${d.products.slug}`}>{d.products.title}</Link> : "Product"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {d.products?.file_format ? `${String(d.products.file_format).toUpperCase()} · ` : ""}
                {d.orders?.order_number ? `Order ${d.orders.order_number} · ` : ""}
                {d.downloaded_at
                  ? `Downloaded ${new Date(d.downloaded_at).toLocaleString()}`
                  : `Link expires ${new Date(d.expires_at).toLocaleString()}`}
              </p>
              <div className="mt-4"><DownloadLink orderId={d.order_id} /></div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
