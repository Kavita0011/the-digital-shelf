import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BuyButton } from "@/components/buy-button";

export const dynamic = "force-dynamic";
export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: product } = await getSupabaseAdmin().from("products").select("*").eq("slug", slug).eq("status", "approved").single();
  if (!product) notFound();
  const { data: seller } = await getSupabaseAdmin().from("seller_profiles").select("store_name,bio").eq("id", product.seller_id).single();
  return (
    <div className="container-page grid gap-10 py-12 lg:grid-cols-2">
      <div className="card flex min-h-80 items-center justify-center bg-slate-100">
        {product.preview_image_url ? <img src={product.preview_image_url} alt="Preview" className="w-full rounded-2xl object-cover" /> : <span className="text-slate-400">Watermarked preview</span>}
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
