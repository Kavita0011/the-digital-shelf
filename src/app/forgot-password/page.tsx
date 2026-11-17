import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="container-page max-w-md py-16">
      <h1 className="mb-2 text-2xl font-bold">Forgot password</h1>
      <p className="mb-6 text-sm text-slate-500">We&apos;ll email you a one-time link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="mt-4 text-sm text-slate-500">
        <Link className="text-brand-600 hover:underline" href="/login">Back to log in</Link>
      </p>
    </div>
  );
}
