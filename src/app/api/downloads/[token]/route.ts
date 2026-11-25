import { parseTokenParam } from "@/lib/query";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireUser, HttpError, requestIp } from "@/lib/auth";
import { presignDownload } from "@/lib/storage";
import { downloadTtlSeconds } from "@/lib/downloads";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Purchase-bound download gate.
 * Validates that the token belongs to the signed-in buyer, is unexpired and
 * unused (unless repeat downloads are enabled), then redirects to a fresh
 * Supabase Storage signed GET URL that expires in 10 minutes.
 */
export const GET = async (req: NextRequest, ctx: { params: Promise<{ token: string }> }) => {
  try {
    const user = await requireUser();
    const token = parseTokenParam((await ctx.params).token);
    const db = getSupabaseAdmin();

    const { data: record } = await db.from("downloads")
      .select("id,user_id,order_id,product_id,file_id,downloaded_at,expires_at")
      .eq("download_token", token).single();
    if (!record || record.user_id !== user.id) throw new HttpError(404, "Download link not found", "not_found");
    if (new Date(record.expires_at) < new Date()) throw new HttpError(410, "Download link expired", "expired");

    const { data: allowed } = await db.rpc("consume_download_token", { p_token: token, p_user_id: user.id });
    if (!allowed) throw new HttpError(409, "Download already used for this purchase", "download_limit_reached");

    const { data: file } = await db.from("product_files")
      .select("storage_path,scan_status").eq("id", record.file_id).single();
    if (!file || file.scan_status !== "clean") throw new HttpError(403, "File unavailable", "file_unavailable");

    await audit({
      actorId: user.id, actorRole: user.role, action: "download.consumed",
      targetType: "order", targetId: record.order_id,
      metadata: { productId: record.product_id }, ip: requestIp(req),
    });

    const url = await presignDownload(String(file.storage_path), downloadTtlSeconds());
    return NextResponse.redirect(url, 302);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : "Download failed";
    return NextResponse.json({ ok: false, error: { message } }, { status });
  }
};
