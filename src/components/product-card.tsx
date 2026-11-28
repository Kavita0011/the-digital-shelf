/* eslint-disable @next/next/no-img-element -- preview URLs are seller-provided and not Next Image compatible */
import Link from "next/link";
import { contentTypeLabel } from "@/lib/types";

export function ProductCard({ product }: { product: Record<string, unknown> }) {
  const contentType = contentTypeLabel(product.content_type);
  return (
    <Link href={`/products/${product.slug}`} className="card group overflow-hidden transition hover:shadow-md">
      <div className="flex h-40 items-center justify-center bg-slate-100 text-xs text-slate-400">
        {product.preview_image_url
          ? <img src={String(product.preview_image_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : "Preview"}
      </div>
      <div className="p-4">
        <span className="badge bg-brand-600/10 text-brand-700">{contentType}</span>
        <h3 className="mt-2 font-semibold group-hover:text-brand-600">{String(product.title)}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{String(product.short_description)}</p>
        <p className="mt-3 font-bold">{Number(product.price)} credits</p>
      </div>
    </Link>
  );
}
