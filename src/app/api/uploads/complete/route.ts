import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertDeclaredMime, inspectFile } from "@/lib/file-security";
import { startScan, pollScan, type ScanOutcome } from "@/lib/malware";
import { enqueueScan } from "@/lib/queue";
import { deleteObject, getObject, objectExists } from "@/lib/storage";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  productId: z.string().uuid(),
  fileId: z.string().uuid(),
  path: z.string().min(1).max(1000),
  originalFilename: z.string().min(1).max(255),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});

interface UploadContext {
  productId: string;
  fileId: string;
  path: string;
  originalFilename: string;
  analysisId: string;
  actorId: string;
  actorRole: "seller";
}

/** Cleanup must never hide the original rejection reason. */
async function removeRejectedObject(path: string) {
  try {
    await deleteObject(path);
  } catch (error) {
    console.error("Failed to delete rejected upload object", error);
  }
}

async function failScan(ctx: UploadContext, error: unknown) {
  const db = getSupabaseAdmin();
  await removeRejectedObject(ctx.path);
  await db.from("product_files").update({
    scan_status: "failed",
    scan_provider: "virustotal",
    scan_result: { error: String(error), analysisId: ctx.analysisId },
  }).eq("id", ctx.fileId);
  await db.from("products").update({
    status: "rejected",
    file_id: null,
    rejection_reason: "Automated malware scanning failed. Please contact support.",
  }).eq("id", ctx.productId);
  await audit({
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    action: "upload.scan_failed",
    targetType: "product",
    targetId: ctx.productId,
    metadata: { analysisId: ctx.analysisId, error: String(error) },
  });
}

async function applyOutcome(ctx: UploadContext, outcome: ScanOutcome) {
  const db = getSupabaseAdmin();
  await db.from("product_files").update({
    scan_status: outcome.status,
    scan_provider: outcome.provider,
    scan_result: outcome.result,
  }).eq("id", ctx.fileId);

  if (outcome.status === "infected") {
    await removeRejectedObject(ctx.path);
    await db.from("products").update({
      status: "rejected",
      file_id: null,
      rejection_reason: "Malware detected by automated security scanning.",
    }).eq("id", ctx.productId);
    await audit({
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      action: "upload.malware_detected",
      targetType: "product",
      targetId: ctx.productId,
      metadata: outcome.result,
    });
    throw new HttpError(422, "Malware detected; product rejected", "malware_detected");
  }

  // Scan passed: seller still cannot publish. Admin review is mandatory.
  await db.from("products").update({ status: "pending_review" }).eq("id", ctx.productId);
  await audit({
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    action: "upload.scan_clean",
    targetType: "product",
    targetId: ctx.productId,
  });
}

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  await rateLimit(`upload-complete:${user.id}`, 20, 60 * 60 * 1000);
  const body = bodySchema.parse(await req.json());

  const db = getSupabaseAdmin();
  const { data: file } = await db.from("product_files")
    .select("product_id,scan_status,storage_path,mime_type,checksum").eq("id", body.fileId).single();
  if (!file || file.product_id !== body.productId) throw new HttpError(404, "Upload record not found", "not_found");
  if (file.scan_status !== "pending") throw new HttpError(409, "This upload has already been processed", "invalid_state");

  const { data: product } = await db.from("products").select("seller_id").eq("id", body.productId).single();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  if (!product || !seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");

  const path = String(file.storage_path);
  if (!(await objectExists(path))) throw new HttpError(400, "Uploaded object missing", "missing_object");

  // Fetch bytes from private Supabase Storage using the service-role client (never a public URL).
  const buffer = await getObject(path);

  let inspected;
  try {
    inspected = inspectFile(buffer, body.originalFilename);
    assertDeclaredMime(String(file.mime_type), inspected.detectedMime);
  } catch (error) {
    await removeRejectedObject(path);
    await db.from("product_files").update({ scan_status: "failed", scan_result: { error: String(error) } }).eq("id", body.fileId);
    await db.from("products").update({ status: "draft", file_id: null }).eq("id", body.productId);
    throw error;
  }

  if (inspected.checksum !== body.expectedChecksum || inspected.checksum !== file.checksum) {
    await removeRejectedObject(path);
    await db.from("product_files").update({ scan_status: "failed", scan_result: { error: "checksum_mismatch" } }).eq("id", body.fileId);
    await db.from("products").update({ status: "draft", file_id: null }).eq("id", body.productId);
    throw new HttpError(400, "Checksum mismatch — file may have been altered", "checksum_mismatch");
  }

  await db.from("products").update({ status: "scanning" }).eq("id", body.productId);

  const ctx: UploadContext = {
    productId: body.productId,
    fileId: body.fileId,
    path,
    originalFilename: body.originalFilename,
    analysisId: "",
    actorId: user.id,
    actorRole: "seller",
  };

  let analysisId: string;
  try {
    analysisId = await startScan(buffer, body.originalFilename);
  } catch (error) {
    await failScan({ ...ctx, analysisId: "start_failed" }, error);
    throw new HttpError(422, "Malware scanning failed; product rejected", "scan_failed");
  }
  ctx.analysisId = analysisId;

  await db.from("product_files").update({
    scan_status: "scanning",
    scan_provider: "virustotal",
    scan_analysis_id: analysisId,
    scan_result: { analysisId, queuedAt: new Date().toISOString() },
  }).eq("id", body.fileId);

  const queued = await enqueueScan({
    fileId: ctx.fileId,
    productId: ctx.productId,
    analysisId,
    storagePath: ctx.path,
    originalFilename: ctx.originalFilename,
    expectedChecksum: body.expectedChecksum,
    actorId: ctx.actorId,
    actorRole: "seller",
  });

  if (queued) {
    await audit({
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      action: "upload.scan_queued",
      targetType: "product",
      targetId: ctx.productId,
      metadata: { analysisId },
    });
    return ok({ scanStatus: "scanning", nextStatus: "scanning", queued: true });
  }

  // Local/VPS fallback: no Cloudflare Queue binding, so poll synchronously.
  let outcome: ScanOutcome;
  try {
    outcome = await pollScan(analysisId);
  } catch (error) {
    await failScan(ctx, error);
    throw new HttpError(422, "Malware scanning failed; product rejected", "scan_failed");
  }
  await applyOutcome(ctx, outcome);
  return ok({ scanStatus: outcome.status, nextStatus: "pending_review", queued: false });
});
