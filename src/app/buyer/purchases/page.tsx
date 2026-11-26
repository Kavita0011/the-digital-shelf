import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DownloadLink } from "@/components/download-link";
import { contentTypeLabel } from "@/lib/types";

export const metadata = { title: "Purchases" };

interface PurchaseRow {
  id: string;
  order_number: string;
  total_paid: number;
  payment_status: string;
  created_at: string;
  products: {
    title: string;
    slug: string;
    content_type: string | null;
    file_format: string | null;
    seller_id: string;
  } | null;
}

interface SellerRow { id: string; store_name: string }

export default async function PurchasesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const { data } = await db.from("orders")
    .select("id,order_number,total_paid,payment_status,created_at,products(title,slug,content_type,file_format,seller_id)")
    .eq("buyer_id", user.id).order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as PurchaseRow[];

  const sellerIds = [...new Set(rows.map((o) => o.products?.seller_id).filter((id): id is string => Boolean(id)))];
  const sellerResult = sellerIds.length
    ? await db.from("seller_profiles").select("id,store_name").in("id", sellerIds)
    : { data: [] as SellerRow[] };
  const sellers = new Map((sellerResult.data ?? []).map((s) => [s.id, s.store_name]));

  return (
    <>
      <h1 className="text-2xl font-bold">My products</h1>
      <p className="mt-1 text-sm text-slate-500">Everything you bought, with its invoice and download in one place. Seller details are secondary.</p>
      {rows.length === 0 ? (
        <div className="card mt-6 p-8 text-center">
          <p className="font-semibold">No purchases yet.</p>
          <p className="mt-1 text-sm text-slate-500">Approved products will appear here after checkout.</p>
          <Link className="btn mt-4" href="/products">Browse products</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {rows.map((o) => {
            const product = o.products;
            return (
              <article key={o.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="badge bg-brand-600/10 text-brand-700">{contentTypeLabel(product?.content_type)}</span>
                    <h2 className="mt-2 text-lg font-semibold">
                      {product ? <Link className="hover:text-brand-600" href={`/products/${product.slug}`}>{product.title}</Link> : "Product"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {product?.file_format ? `${String(product.file_format).toUpperCase()} · ` : ""}Order {o.order_number} · {new Date(o.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">${(Number(o.total_paid) / 100).toFixed(2)}</p>
                    <p className="text-xs capitalize text-slate-500">{o.payment_status}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-brand-600">
                  <Link className="hover:underline" href={`/invoices/${o.id}`}>View invoice</Link>
                  {o.payment_status === "paid" ? <DownloadLink orderId={o.id} /> : <span className="text-slate-400">Download available after payment</span>}
                  {product && <Link className="hover:underline" href={`/products/${product.slug}`}>Product page</Link>}
                </div>
                <p className="mt-4 border-t pt-3 text-xs text-slate-500">
                  Sold by {product ? (sellers.get(product.seller_id) ?? "an independent seller") : "an independent seller"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
