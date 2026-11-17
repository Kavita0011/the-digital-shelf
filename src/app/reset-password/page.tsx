import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="text-3xl font-bold">Reset password</h1>
      <p className="mt-2 text-sm text-slate-500">
        Choose a new password for your account. The link in your email expires shortly.
      </p>
      <div className="mt-6">
        <ResetPasswordForm tokenHash={tokenHash} />
      </div>
      <p className="mt-4 text-sm text-slate-500">
        <Link className="text-brand-600 hover:underline" href="/login">Back to log in</Link>
      </p>
    </div>
  );
}
