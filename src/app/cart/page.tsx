import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CheckoutButton } from "@/components/checkout-button";
import { RemoveFromCartButton } from "@/components/cart-controls";

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

function embeddedProduct(value: unknown): CartProduct | undefined {
  if (Array.isArray(value)) return value[0] as CartProduct | undefined;
  return (value as CartProduct | null) ?? undefined;
}

export default async function CartPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const user = await requireUser().catch(() => redirect("/login"));
  const { data: items, error } = await getSupabaseAdmin()
    .from("carts")
    .select("product_id,products(id,title,slug,price,currency,status)")
    .eq("user_id", user.id);
  if (error) throw error;

  const rows = (items ?? []).map((item) => ({
    productId: item.product_id,
    product: embeddedProduct(item.products),
  }));
  // Stale entries stay visible with a warning so the buyer understands why
  // they were excluded from checkout.
  const available = rows.filter((row) => row.product?.status === "approved");
  const stale = rows.filter((row) => row.product?.status !== "approved");
  const productIds = available.map((row) => row.productId);
  const total = available.reduce((sum, row) => sum + Number(row.product?.price ?? 0), 0);
  const { data: wallet } = await getSupabaseAdmin().from("credit_wallets")
    .select("balance").eq("user_id", user.id).single();
  const balance = Number(wallet?.balance ?? 0);

  return (
    <div className="container-page max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Your cart</h1>
      {status === "cancelled" && (
        <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Checkout was cancelled. Your cart is unchanged.
        </p>
      )}

      {stale.length > 0 && (
        <div role="status" className="card mt-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Some items are no longer available.</p>
          <p className="mt-1">They are excluded from checkout and can be removed below.</p>
          <ul className="mt-3 divide-y divide-amber-200">
            {stale.map(({ productId, product }) => (
              <li className="flex items-center justify-between gap-4 py-2" key={productId}>
                <span>{product?.title ?? "Unavailable product"}</span>
                <RemoveFromCartButton productId={productId} />
              </li>
            ))}
          </ul>
        </div>
      )}

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
                <div className="flex items-center gap-4">
                  <span className="font-semibold">{Number(product!.price)} credits</span>
                  <RemoveFromCartButton productId={productId} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-bold">Total: {total} credits</p>
              <p className="mt-1 text-xs text-slate-500">
                {balance} available · <Link className="text-brand-600 hover:underline" href="/buyer/credits">Buy credits</Link>
              </p>
            </div>
            <CheckoutButton productIds={productIds} />
          </div>
        </>
      )}
    </div>
  );
}
