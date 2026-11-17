import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";

export const dynamic = "force-dynamic";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <div className="container-page flex flex-col gap-8 py-10 md:flex-row"><DashboardNav area="buyer" /><div className="min-w-0 flex-1">{children}</div></div>;
}
