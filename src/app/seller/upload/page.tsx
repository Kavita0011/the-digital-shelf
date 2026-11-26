import { UploadWizard } from "@/components/upload-wizard";
import { safePublicRead } from "@/lib/safe-data";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";

export const metadata = { title: "Upload product" };

export default async function UploadPage() {
  const categories = await safePublicRead(
    (db) => db.from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name").then((r) => r.data ?? []),
    [],
  );
  return (
    <>
      <h1 className="text-2xl font-bold">Upload a product</h1>
      <p className="mt-1 text-sm text-slate-500">Choose a topic and a content type. Every file is scanned and reviewed by an admin before it goes live.</p>
      <UploadWizard categories={categories as Array<{ id: string; name: string; description: string | null }>} />
    </>
  );
}
