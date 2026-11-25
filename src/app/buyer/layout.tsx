import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { readImpersonationRole } from "@/lib/impersonation";

export const dynamic = "force-dynamic";

export default async function BuyerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const viewMode = user.impersonating ? await readImpersonationRole(user.id) : null;
  return <div className="container-page py-10">{user.impersonating && <ImpersonationBanner role={user.role} mode={viewMode} />}<div className="flex flex-col gap-8 md:flex-row"><DashboardNav area="buyer" /><div className="min-w-0 flex-1">{children}</div></div></div>;
}
