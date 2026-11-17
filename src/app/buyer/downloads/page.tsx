import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const metadata = { title: "Downloads" };

interface DownloadRow {
  id: string;
  downloaded_at: string | null;
  expires_at: string;
  products: { title: string } | null;
}

export default async function DownloadsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { data } = await getSupabaseAdmin().from("downloads")
    .select("id,downloaded_at,expires_at,products(title)")
    .eq("user_id", user.id).order("expires_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as DownloadRow[];
  return (
    <>
      <h1 className="text-2xl font-bold">Download history</h1>
      <div className="card mt-6 divide-y">
        {rows.map((d) => (
          <div key={d.id} className="flex justify-between p-4 text-sm">
            <span>{d.products?.title ?? "Product"}</span>
            <span className="text-slate-500">
              {d.downloaded_at
                ? `Downloaded ${new Date(d.downloaded_at).toLocaleString()}`
                : `Token expires ${new Date(d.expires_at).toLocaleString()}`}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
