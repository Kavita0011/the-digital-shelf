import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata = { title: "Upload limits" };
export const dynamic = "force-dynamic";

export default async function UploadLimits() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles")
    .select("id,upload_limit").eq("user_id", user.id).single();
  if (!seller) redirect("/sell");
  const { count } = await db.from("products")
    .select("id", { count: "exact", head: true }).eq("seller_id", seller.id);
  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold">Upload limits</h1>
      <div className="card mt-6 p-6">
        <p>Used {count ?? 0} of {seller.upload_limit ?? 0} product slots.</p>
      </div>
    </div>
  );
}
