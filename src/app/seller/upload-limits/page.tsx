import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
export default async function UploadLimits(){ const user=await getCurrentUser(); const {data:seller}=await getSupabaseAdmin().from("seller_profiles").select("upload_limit").eq("user_id",user!.id).single(); const {count}=await getSupabaseAdmin().from("products").select("id",{count:"exact",head:true}).eq("seller_id",user!.id); return <><h1 className="text-2xl font-bold">Upload limits</h1><div className="card mt-6 p-6"><p>Used {count ?? 0} of {seller?.upload_limit ?? 0} product slots.</p></div></>; }
