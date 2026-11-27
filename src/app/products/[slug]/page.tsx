import { notFound } from "next/navigation";
import Link from "next/link";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-catalog";
import { BuyButton } from "@/components/buy-button";
import { AddToCartButton } from "@/components/cart-controls";
import { contentTypeDescription, contentTypeLabel } from "@/lib/types";
import { categoryIcon } from "@/lib/category-taxonomy";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await safePublicRead(
    (db) => db.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("slug", slug).eq("status", "approved").single().then((r) => r.data ?? null),
    null,
  );
  if (!product) notFound();

  // Best-effort analytics: the atomic RPC locks the row, and a counter failure
  // must never prevent buyers from seeing an approved product.
  try {
    await getSupabaseAdmin().rpc("increment_view_count", { p_product_id: product.id });
  } catch (error) {
    console.warn("Could not record product view", error);
  }

  const [seller, category] = await Promise.all([
    safePublicRead(
      (db) => db.from("seller_profiles").select("store_name,bio").eq("id", product.seller_id).single().then((r) => r.data ?? null),
      null,
    ),
    product.category_id
      ? safePublicRead(
          (db) => db.from("categories").select("name,slug").eq("id", product.category_id!).single().then((r) => r.data ?? null),
          null,
        )
      : Promise.resolve(null),
  ]);

  const contentType = product.content_type;
  const typeLabel = contentTypeLabel(contentType);
  const categoryName = category?.name ?? null;

  return (
    <div className="container-page grid gap-10 py-12 lg:grid-cols-2">
      <div className="card flex min-h-80 items-center justify-center bg-slate-100">
        {product.preview_image_url
          ? /* eslint-disable-next-line @next/next/no-img-element -- seller-provided preview URL */
            <img src={product.preview_image_url} alt={`Preview of ${product.title}`} className="w-full rounded-2xl object-cover" />
          : <span className="text-slate-400">Watermarked preview</span>}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-brand-600/10 text-brand-700">{typeLabel}</span>
          {categoryName && (
            <Link className="badge bg-slate-100 hover:bg-slate-200" href={`/products?category=${product.category_id}`}>
              <span aria-hidden className="mr-1">{categoryIcon(category?.slug)}</span>{categoryName}
            </Link>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-bold">{product.title}</h1>
        <p className="mt-3 text-slate-600">{product.short_description}</p>
        <p className="mt-6 text-2xl font-bold">${(Number(product.price) / 100).toFixed(2)}</p>

        <div className="mt-4 flex flex-wrap gap-2">{(product.tags as string[]).map((t) => <span className="badge bg-slate-100" key={t}>{t}</span>)}</div>

        <div className="card mt-6 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">What you&apos;ll get</p>
          <p className="mt-2 text-sm text-slate-700">{contentTypeDescription(contentType)}</p>
          {product.file_format && <p className="mt-2 text-xs text-slate-500">Primary file: {String(product.file_format).toUpperCase()}</p>}
        </div>

        <div className="prose mt-8 whitespace-pre-wrap text-sm text-slate-700">{product.description}</div>
        <div className="mt-8 flex flex-wrap gap-3">
          <BuyButton productId={product.id} />
          <AddToCartButton productId={product.id} />
        </div>
        <p className="mt-3 text-xs text-slate-500">Secure checkout · Malware-scanned · Admin approved</p>

        <div className="mt-8 border-t pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sold by a vetted seller</p>
          <h2 className="mt-2 font-semibold">{seller?.store_name ?? "Independent seller"}</h2>
          {seller?.bio && <p className="mt-1 text-sm text-slate-500">{seller.bio}</p>}
        </div>
      </div>
    </div>
  );
}
