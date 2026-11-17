import Link from "next/link";

export function ProductCard({ product }: { product: Record<string, unknown> }) {
  return (
    <Link href={`/products/${product.slug}`} className="card group overflow-hidden transition hover:shadow-md">
      <div className="flex h-40 items-center justify-center bg-slate-100 text-xs text-slate-400">
        {product.preview_image_url
          ? <img src={String(product.preview_image_url)} alt="" className="h-full w-full object-cover" />
          : "Preview"}
      </div>
      <div className="p-4">
        <h3 className="font-semibold group-hover:text-brand-600">{String(product.title)}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{String(product.short_description)}</p>
        <p className="mt-3 font-bold">${(Number(product.price) / 100).toFixed(2)}</p>
      </div>
    </Link>
  );
}
