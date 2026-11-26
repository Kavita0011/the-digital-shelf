import Link from "next/link";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";
import { categoryIcon } from "@/lib/category-taxonomy";

export const dynamic = "force-dynamic";

interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export default async function CategoriesPage() {
  const { categories, counts } = await safePublicRead(
    async (db) => {
      const [categoryResult, productResult] = await Promise.all([
        db.from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name"),
        db.from("products").select("category_id").eq("status", "approved"),
      ]);
      const totals: Record<string, number> = {};
      for (const row of productResult.data ?? []) {
        if (row.category_id) totals[row.category_id] = (totals[row.category_id] ?? 0) + 1;
      }
      return { categories: (categoryResult.data ?? []) as CategoryView[], counts: totals };
    },
    { categories: [] as CategoryView[], counts: {} as Record<string, number> },
  );

  return (
    <div className="container-page py-12">
      <p className="badge bg-brand-600/10 text-brand-700">Shop by topic</p>
      <h1 className="mt-4 text-3xl font-bold">Categories</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Categories describe what a product helps you do. Format is a separate filter — look for <strong>Content type</strong> when you browse.
      </p>
      {categories.length === 0
        ? <p className="card mt-8 p-6 text-slate-500">No categories are available yet.</p>
        : <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => {
              const count = counts[c.id] ?? 0;
              return (
                <Link key={c.id} href={`/products?category=${c.id}`} className="card p-6 transition hover:border-brand-600 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span aria-hidden className="text-2xl">{categoryIcon(c.slug)}</span>
                    <span className="badge bg-slate-100">{count} {count === 1 ? "product" : "products"}</span>
                  </div>
                  <h2 className="mt-4 font-semibold">{c.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{c.description || "Explore products in this topic."}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-brand-600">Browse →</span>
                </Link>
              );
            })}
          </div>}
    </div>
  );
}
