import { LoginForm } from "@/components/auth-forms";
export const metadata = { title: "Log in" };
export default function LoginPage() {
  return <div className="container-page max-w-md py-16"><h1 className="mb-6 text-2xl font-bold">Welcome back</h1><LoginForm /></div>;
}
