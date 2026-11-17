import Link from "next/link";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";
export const dynamic = "force-dynamic";
export default async function CategoriesPage() {
  const data = await safePublicRead(
    (db) => db.from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name").then((r) => r.data ?? []),
    [],
  );
  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-bold">Categories</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((c) => (
          <Link key={c.id} href={`/products?category=${c.id}`} className="card p-6 hover:border-brand-600">
            <h2 className="font-semibold">{c.name}</h2><p className="mt-1 text-sm text-slate-500">{c.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
