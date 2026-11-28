import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { contentTypeLabel } from "@/lib/types";
import { SellerProductActions } from "@/components/seller-product-actions";

export const metadata = { title: "My products" };

const statusColors: Record<string, string> = {
  draft: "bg-slate-100", scanning: "bg-blue-100", pending_review: "bg-amber-100",
  approved: "bg-green-100", rejected: "bg-red-100", hidden: "bg-slate-200", removed: "bg-red-200",
};

function scanLabel(row: { file_id: string | null; product_files: unknown }): string {
  if (!row.file_id || !row.product_files) return "No file uploaded";
  const file = Array.isArray(row.product_files) ? row.product_files[0] : row.product_files;
  const status = file && typeof file === "object" ? (file as { scan_status?: unknown }).scan_status : null;
  return `Scan: ${status ? String(status).replace(/_/g, " ") : "unknown"}`;
}

export default async function SellerProducts() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  const { data, error } = await db
    .from("products")
    .select("id,title,status,price,content_type,rejection_reason,created_at,file_id,product_files!products_file_fk(scan_status)")
    .eq("seller_id", seller?.id ?? "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const products = data ?? [];

  return (
    <>
      <h1 className="text-2xl font-bold">My products</h1>
      {products.length === 0 ? (
        <div className="card mt-6 p-6 text-sm text-slate-500">
          You have no products yet. <Link className="text-brand-600 hover:underline" href="/seller/upload">Upload your first product</Link>.
        </div>
      ) : (
        <div className="card mt-6 divide-y">
          {products.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{p.title}</span>
                <span className={`badge ${statusColors[p.status] ?? "bg-slate-100"}`}>{p.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {contentTypeLabel(p.content_type)} · {Number(p.price)} credits · {scanLabel(p as { file_id: string | null; product_files: unknown })}
              </p>
              {p.status === "rejected" && p.rejection_reason && (
                <p className="mt-1 text-sm text-red-600">Reason: {p.rejection_reason}</p>
              )}
              <SellerProductActions productId={p.id} title={p.title} status={p.status} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
