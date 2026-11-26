import Link from "next/link";
import { safePublicRead } from "@/lib/safe-data";
import { buildIlikeFilter } from "@/lib/search";
import { ProductCard } from "@/components/product-card";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, type ContentType } from "@/lib/types";
import { uuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface CategoryOption {
  id: string;
  name: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; contentType?: string; q?: string }>;
}) {
  const params = await searchParams;
  const categoryId = params.category && uuid.safeParse(params.category).success ? params.category : "";
  const contentType = CONTENT_TYPES.find((type) => type === params.contentType) ?? "";
  const term = params.q?.trim() ?? "";

  const { products, categories } = await safePublicRead(
    async (db) => {
      let query = db.from("products")
        .select("id,title,slug,short_description,price,currency,preview_image_url,content_type")
        .eq("status", "approved").order("created_at", { ascending: false }).limit(48);
      if (categoryId) query = query.eq("category_id", categoryId);
      if (contentType) query = query.eq("content_type", contentType);
      if (term) query = query.or(buildIlikeFilter(term, "title", "short_description", 80));

      const [productResult, categoryResult] = await Promise.all([
        query,
        db.from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name"),
      ]);
      return {
        products: (productResult.data ?? []) as Array<Record<string, unknown>>,
        categories: (categoryResult.data ?? []) as CategoryOption[],
      };
    },
    { products: [] as Array<Record<string, unknown>>, categories: [] as CategoryOption[] },
  );

  const hasFilters = Boolean(categoryId || contentType || term);
  const currentCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="container-page py-12">
      <p className="badge bg-brand-600/10 text-brand-700">The shelf</p>
      <h1 className="mt-4 text-3xl font-bold">{term ? `Results for “${term}”` : "Browse products"}</h1>
      <p className="mt-2 text-slate-600">Filter by topic and by what you want to do with the file.</p>

      <form className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr,auto,auto,auto] sm:items-end" action="/products">
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input className="input" id="q" name="q" placeholder="planner, ebook, resume…" defaultValue={term} />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select className="input" id="category" name="category" defaultValue={categoryId}>
            <option value="">All topics</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="contentType">Content type</label>
          <select className="input" id="contentType" name="contentType" defaultValue={contentType}>
            <option value="">All formats</option>
            {CONTENT_TYPES.map((type) => <option key={type} value={type}>{CONTENT_TYPE_LABELS[type as ContentType]}</option>)}
          </select>
        </div>
        <button className="btn h-[42px]">Apply</button>
      </form>

      {hasFilters && <p className="mt-4 text-sm text-slate-500">
        {currentCategory ? `Topic: ${currentCategory.name}. ` : ""}
        {contentType ? `Format: ${CONTENT_TYPE_LABELS[contentType as ContentType]}. ` : ""}
        <Link className="font-semibold text-brand-600 hover:underline" href="/products">Clear filters</Link>
      </p>}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((p) => <ProductCard key={String(p.id)} product={p} />)}
      </div>
      {products.length === 0 && (
        <div className="card mt-8 p-8 text-center">
          <p className="font-semibold">Nothing on the shelf matches those filters.</p>
          <p className="mt-1 text-sm text-slate-500">Try a different topic or content type. New products are added after admin review.</p>
          <Link className="btn mt-4" href="/products">Browse everything</Link>
        </div>
      )}
    </div>
  );
}
