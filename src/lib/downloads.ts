import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { HttpError } from "./auth";
import { audit } from "./audit";

/**
 * Issue a purchase-bound download authorization.
 * - Requires a paid order owned by the buyer.
 * - Creates an expiring download token (10 minutes default).
 * - Repeated downloads are only allowed when the setting is enabled.
 */
export async function issueDownloadUrl(
  orderId: string,
  userId: string,
  ip: string | null,
  userAgent: string | null,
) {
  const db = getSupabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).eq("buyer_id", userId).single();
  if (!order) throw new HttpError(404, "Order not found", "not_found");
  if (!["paid", "partially_refunded"].includes(String(order.payment_status))) {
    throw new HttpError(403, "Payment not completed", "payment_required");
  }
  // Buyers retain access when a product is later removed (legal/security
  // revocations are handled by admins deleting the file object explicitly).
  const { data: product } = await db.from("products").select("id,file_id,title").eq("id", order.product_id).single();
  if (!product?.file_id) throw new HttpError(404, "Product file unavailable", "file_missing");
  const { data: file } = await db.from("product_files").select("storage_path,scan_status").eq("id", product.file_id).single();
  if (!file || file.scan_status !== "clean") throw new HttpError(403, "File not available for download", "file_unavailable");

  const existing = await db.from("downloads").select("id,downloaded_at")
    .eq("order_id", orderId).eq("user_id", userId).order("expires_at", { ascending: false }).limit(1);
  const { data: setting } = await db.from("settings").select("value").eq("key", "allow_repeat_downloads").single();
  const repeatAllowed = setting?.value === true;
  if (existing.data?.[0]?.downloaded_at && !repeatAllowed) {
    throw new HttpError(409, "Download already used for this purchase", "download_limit_reached");
  }

  const token = randomBytes(32).toString("hex");
  const ttl = Number(process.env.DOWNLOAD_URL_TTL_SECONDS ?? 600);
  await db.from("downloads").insert({
    order_id: orderId, user_id: userId, product_id: product.id,
    file_id: product.file_id, download_token: token,
    ip_address: ip, user_agent: userAgent,
    expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
  });
  await audit({
    actorId: userId, actorRole: "buyer", action: "download.url_issued",
    targetType: "order", targetId: orderId,
    metadata: { productId: product.id }, ip, userAgent,
  });
  // Return our gated URL; it validates the token and redirects to a fresh R2
  // signed URL so the download token is truly single-use.
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/downloads/${token}`;
  return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString(), expiresInSeconds: ttl };
}
