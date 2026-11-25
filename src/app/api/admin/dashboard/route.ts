import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  await requireRole("admin");
  const db = getSupabaseAdmin();
  const [users, sellers, buyers, products, pending, orders, refunds, disputes, wallets] = await Promise.all([
    db.from("users").select("id", { count: "exact", head: true }),
    db.from("seller_profiles").select("id", { count: "exact", head: true }),
    db.from("users").select("id", { count: "exact", head: true }).eq("role", "buyer"),
    db.from("products").select("id", { count: "exact", head: true }).eq("status", "approved"),
    db.from("products").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
    db.from("orders").select("total_paid,platform_commission")
      .in("payment_status", ["paid", "partially_refunded", "refunded"]),
    db.from("refunds").select("amount", { count: "exact", head: true }),
    db.from("disputes").select("id", { count: "exact", head: true }).in("status", ["needs_response", "under_review"]),
    db.from("credit_wallets").select("balance,pending_balance"),
  ]);

  for (const result of [users, sellers, buyers, products, pending, orders, refunds, disputes, wallets]) {
    if (result.error) throw result.error;
  }

  const paidOrders = orders.data ?? [];
  const creditsInCirculation = (wallets.data ?? []).reduce(
    (sum, wallet) => sum + Number(wallet.balance) + Number(wallet.pending_balance),
    0,
  );

  return ok({
    users: users.count ?? 0,
    sellers: sellers.count ?? 0,
    buyers: buyers.count ?? 0,
    products: products.count ?? 0,
    pendingReviews: pending.count ?? 0,
    sales: paidOrders.length,
    revenue: paidOrders.reduce((sum, order) => sum + Number(order.total_paid), 0),
    platformFees: paidOrders.reduce((sum, order) => sum + Number(order.platform_commission), 0),
    refunds: refunds.count ?? 0,
    disputes: disputes.count ?? 0,
    creditsInCirculation,
  });
});
