import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { LogoutButton } from "@/components/logout-button";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/site";
import { AccountSecurityPanel } from "@/components/account-security-panel";

export const metadata = { title: "Seller settings" };
export const dynamic = "force-dynamic";

export default async function SellerSettings() {
  const user = await requireUser().catch(() => redirect("/login"));
  const { data: seller, error } = await getSupabaseAdmin()
    .from("seller_profiles")
    .select("store_name,bio,verification_status,payout_status,upload_limit")
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") throw error;

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Seller settings</h1>
      <p className="mt-2 text-sm text-slate-600">Your shop details and account shortcuts.</p>

      {!seller ? (
        <div className="card mt-6 p-6" role="status">
          <p>You do not have a seller profile yet.</p>
          <Link className="btn mt-4" href="/sell">Become a seller</Link>
        </div>
      ) : (
        <section className="card mt-6 p-6">
          <h2 className="font-semibold">Shop profile</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Shop name</dt><dd className="font-medium">{seller.store_name}</dd></div>
            <div><dt className="text-slate-500">Verification</dt><dd className="font-medium capitalize">{seller.verification_status}</dd></div>
            <div><dt className="text-slate-500">Payout status</dt><dd className="font-medium capitalize">{seller.payout_status}</dd></div>
            <div><dt className="text-slate-500">Product limit</dt><dd className="font-medium">{seller.upload_limit}</dd></div>
          </dl>
          {seller.bio && <p className="mt-4 border-t pt-4 text-sm text-slate-600">{seller.bio}</p>}
          <p className="mt-4 text-xs text-slate-500">To change shop details, contact <a className="text-brand-600 hover:underline" href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>.</p>
        </section>
      )}

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Shortcuts</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-ghost" href="/seller/dashboard">Seller dashboard</Link>
          <Link className="btn-ghost" href="/seller/products">Products</Link>
          <Link className="btn-ghost" href="/seller/upload">Upload</Link>
          <Link className="btn-ghost" href="/seller/earnings">Earnings</Link>
          <Link className="btn-ghost" href="/seller/sales">Sales</Link>
          <Link className="btn-ghost" href="/notifications">Notifications</Link>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Password and account</h2>
        <p className="mt-2 text-sm text-slate-600">Signed in as {user.email}. Use the secure reset flow to change your password.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link className="btn-ghost" href="/forgot-password">Reset password</Link>
          <LogoutButton />
        </div>
        <div className="mt-6 border-t pt-4">
          <DeleteAccountButton />
        </div>
      </section>

      <AccountSecurityPanel />
    </div>
  );
}
