import { RegisterForm } from "@/components/auth-forms";
export const metadata = { title: "Register" };
export default function RegisterPage() {
  return <div className="container-page max-w-md py-16"><h1 className="mb-2 text-2xl font-bold">Create your account</h1><p className="mb-6 text-sm text-slate-500">Browse and buy curated digital products.</p><RegisterForm /></div>;
}
