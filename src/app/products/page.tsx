import { safePublicRead } from "@/lib/safe-data";
import { buildIlikeFilter } from "@/lib/search";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const params = await searchParams;
  const data = await safePublicRead((db) => {
    let q = db.from("products")
      .select("id,title,slug,short_description,price,currency,preview_image_url")
      .eq("status", "approved").order("created_at", { ascending: false }).limit(48);
    if (params.category) q = q.eq("category_id", params.category);
    if (params.q?.trim()) q = q.or(buildIlikeFilter(params.q, "title", "short_description", 80));
    return q.then((r) => r.data ?? []);
  }, []);
  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-bold">{params.q ? `Results for “${params.q}”` : "Browse products"}</h1>
      <form className="mt-6 flex gap-2" action="/products">
        <input className="input max-w-md" name="q" placeholder="Search templates, planners, ebooks…" defaultValue={params.q} />
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {(data ?? []).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
