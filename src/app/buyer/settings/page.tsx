import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/site";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function BuyerSettings() {
  const user = await requireUser().catch(() => redirect("/login"));

  return (
    <div className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold">Account settings</h1>
      <p className="mt-2 text-sm text-slate-600">Your account details and shortcuts. Profile data is stored in Supabase Auth.</p>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Profile</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Name</dt><dd className="font-medium">{user.fullName ?? "Not set"}</dd></div>
          <div><dt className="text-slate-500">Email</dt><dd className="font-medium break-all">{user.email}</dd></div>
          <div><dt className="text-slate-500">Role</dt><dd className="font-medium capitalize">{user.role.replace("_", " ")}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd className="font-medium capitalize">{user.status}</dd></div>
        </dl>
        {user.impersonating && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
            Admin preview mode is active. Your stored role remains {user.realRole.replace("_", " ")}.
          </p>
        )}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Shortcuts</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-ghost" href="/buyer/dashboard">Buyer dashboard</Link>
          <Link className="btn-ghost" href="/buyer/credits">Credits</Link>
          <Link className="btn-ghost" href="/buyer/credit-history">Credit history</Link>
          <Link className="btn-ghost" href="/buyer/purchases">Purchases</Link>
          <Link className="btn-ghost" href="/notifications">Notifications</Link>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Security</h2>
        <p className="mt-2 text-sm text-slate-600">Use the secure reset flow to change your password. Support can help with account recovery at <a className="text-brand-600 hover:underline" href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link className="btn-ghost" href="/forgot-password">Reset password</Link>
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}
