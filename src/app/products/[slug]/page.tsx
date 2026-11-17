import { notFound } from "next/navigation";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-catalog";
import { BuyButton } from "@/components/buy-button";

export const dynamic = "force-dynamic";
export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await safePublicRead(
    (db) => db.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("slug", slug).eq("status", "approved").single().then((r) => r.data ?? null),
    null,
  );
  if (!product) notFound();
  const seller = await safePublicRead(
    (db) => db.from("seller_profiles").select("store_name,bio").eq("id", product.seller_id).single().then((r) => r.data ?? null),
    null,
  );
  return (
    <div className="container-page grid gap-10 py-12 lg:grid-cols-2">
      <div className="card flex min-h-80 items-center justify-center bg-slate-100">
        {product.preview_image_url
            ? /* eslint-disable-next-line @next/next/no-img-element -- seller-provided preview URL */
              <img src={product.preview_image_url} alt={`Preview of ${product.title}`} className="w-full rounded-2xl object-cover" />
            : <span className="text-slate-400">Watermarked preview</span>}
      </div>
      <div>
        <p className="text-sm text-slate-500">{seller?.store_name}</p>
        <h1 className="mt-2 text-3xl font-bold">{product.title}</h1>
        <p className="mt-3 text-slate-600">{product.short_description}</p>
        <p className="mt-6 text-2xl font-bold">${(Number(product.price) / 100).toFixed(2)}</p>
        <div className="mt-4 flex flex-wrap gap-2">{(product.tags as string[]).map((t) => <span className="badge bg-slate-100" key={t}>{t}</span>)}</div>
        <div className="prose mt-8 whitespace-pre-wrap text-sm text-slate-700">{product.description}</div>
        <BuyButton productId={product.id} />
        <p className="mt-3 text-xs text-slate-500">Secure checkout · Malware-scanned · Admin approved</p>
      </div>
    </div>
  );
}
