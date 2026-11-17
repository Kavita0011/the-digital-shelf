import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CheckoutButton } from "@/components/checkout-button";

export const metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

interface CartProduct {
  id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  status: string;
}

export default async function CartPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const user = await requireUser().catch(() => redirect("/login"));
  const db = getSupabaseAdmin();
  const { data: items } = await db.from("carts")
    .select("product_id,products(id,title,slug,price,currency,status)")
    .eq("user_id", user.id);

  const rows = (items ?? []).map((item) => ({
    productId: item.product_id,
    product: Array.isArray(item.products) ? (item.products[0] as CartProduct | undefined) : undefined,
  }));
  // Only approved products can be checked out; stale entries stay visible
  // with a warning so the buyer understands why they were excluded.
  const available = rows.filter((row) => row.product?.status === "approved");
  const productIds = available.map((row) => row.productId);
  const total = available.reduce((sum, row) => sum + Number(row.product?.price ?? 0), 0);

  return (
    <div className="container-page max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Your cart</h1>
      {status === "cancelled" && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Checkout was cancelled. Your cart is unchanged.</p>}
      {available.length === 0 ? (
        <div className="card mt-6 p-6 text-slate-500">
          <p>Your cart is empty.</p>
          <Link className="mt-3 inline-block font-semibold text-brand-600 hover:underline" href="/products">Browse the shelf →</Link>
        </div>
      ) : (
        <>
          <ul className="card mt-6 divide-y">
            {available.map(({ productId, product }) => (
              <li className="flex items-center justify-between gap-4 p-4" key={productId}>
                <Link className="font-medium hover:text-brand-600" href={`/products/${product!.slug}`}>{product!.title}</Link>
                <span className="font-semibold">${(Number(product!.price) / 100).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-lg font-bold">Total: ${(total / 100).toFixed(2)}</p>
            <CheckoutButton productIds={productIds} />
          </div>
        </>
      )}
    </div>
  );
}
