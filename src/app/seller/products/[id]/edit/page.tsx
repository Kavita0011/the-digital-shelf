import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseUuidParam } from "@/lib/query";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";
import { CONTENT_TYPES, type ContentType } from "@/lib/types";
import { UploadWizard, type InitialProduct } from "@/components/upload-wizard";
import { canSellerEdit } from "@/lib/product-workflow";

export const metadata = { title: "Edit product" };

const REFUND_PREFIX = "Refund/support policy: ";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = parseUuidParam((await params).id);
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  if (!seller) redirect("/seller/products");
  const { data: product } = await db
    .from("products")
    .select("id,title,short_description,description,category_id,content_type,tags,price,currency,license_type,preview_image_url,rejection_reason,status")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .single();
  if (!product) notFound();
  if (!canSellerEdit(product.status)) redirect("/seller/products");

  const categories = await safePublicRead(
    (client) => client.from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name").then((r) => r.data ?? []),
    [] as Array<{ id: string; name: string; description: string | null }>,
  );

  const initialProduct: InitialProduct = {
    id: product.id,
    title: product.title,
    shortDescription: product.short_description,
    description: product.description,
    categoryId: product.category_id ?? "",
    contentType: CONTENT_TYPES.includes(product.content_type as ContentType)
      ? (product.content_type as ContentType)
      : "",
    tags: Array.isArray(product.tags) ? product.tags.map(String) : [],
    price: Number(product.price ?? 0),
    currency: product.currency ?? "usd",
    licenseType: product.license_type as InitialProduct["licenseType"],
    // Legacy drafts stored the policy in rejection_reason; use it only as a
    // form default. Saving never writes it back to that column.
    refundPolicy: product.rejection_reason?.startsWith(REFUND_PREFIX)
      ? product.rejection_reason.slice(REFUND_PREFIX.length)
      : "",
    previewImageUrl: product.preview_image_url ?? "",
    rejectionReason: product.status === "rejected" ? product.rejection_reason : null,
  };

  return (
    <>
      <h1 className="text-2xl font-bold">Edit product</h1>
      <p className="mt-1 text-sm text-slate-500">
        Update the details, upload a new file for scanning, then submit it for admin review again.
      </p>
      <UploadWizard categories={categories} initialProduct={initialProduct} />
    </>
  );
}
