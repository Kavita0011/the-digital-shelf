import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: products } = await getSupabaseAdmin()
    .from("products")
    .select("id,title,slug,short_description,price,currency,preview_image_url")
    .eq("status", "approved")
    .order("is_featured", { ascending: false })
    .limit(8);

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-br from-brand-50 to-white">
        <div className="container-page grid gap-10 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="badge bg-brand-600/10 text-brand-700">Curated · Secure · Limited catalog</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Better digital products, thoughtfully curated.</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Templates, planners, ebooks and creative assets from vetted sellers. Every file is malware-scanned and admin-approved before it reaches the shelf.
            </p>
            <div className="mt-8 flex gap-3">
              <Link className="btn" href="/products">Browse the shelf</Link>
              <Link className="btn-ghost" href="/sell">Start selling</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {["Templates", "Planners", "Ebooks", "AI prompts", "Clipart", "Spreadsheets"].map((x) => (
              <div key={x} className="card flex h-28 items-center justify-center text-sm font-semibold text-slate-500">{x}</div>
            ))}
          </div>
        </div>
      </section>
      <section className="container-page py-16">
        <div className="mb-8 flex items-end justify-between">
          <div><h2 className="text-2xl font-bold">Featured products</h2><p className="text-sm text-slate-500">Fresh from the shelf</p></div>
          <Link className="text-sm font-semibold text-brand-600" href="/products">View all →</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(products ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        {(products ?? []).length === 0 && <p className="text-slate-500">No approved products yet. Run the seed script to add demo data.</p>}
      </section>
    </>
  );
}

export function ProductCard({ product }: { product: Record<string, unknown> }) {
  return (
    <Link href={`/products/${product.slug}`} className="card group overflow-hidden transition hover:shadow-md">
      <div className="flex h-40 items-center justify-center bg-slate-100 text-xs text-slate-400">
        {product.preview_image_url ? <img src={String(product.preview_image_url)} alt="" className="h-full w-full object-cover" /> : "Preview"}
      </div>
      <div className="p-4">
        <h3 className="font-semibold group-hover:text-brand-600">{String(product.title)}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{String(product.short_description)}</p>
        <p className="mt-3 font-bold">${(Number(product.price) / 100).toFixed(2)}</p>
      </div>
    </Link>
  );
}
