import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { inspectFile } from "@/lib/file-security";
import { scanFile } from "@/lib/malware";
import { getObject, objectExists } from "@/lib/r2";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  productId: z.string().uuid(),
  fileId: z.string().uuid(),
  path: z.string().min(1).max(1000),
  originalFilename: z.string().min(1).max(255),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  rateLimit(`upload-complete:${user.id}`, 20, 60 * 60 * 1000);
  const body = bodySchema.parse(await req.json());

  const db = getSupabaseAdmin();
  const { data: file } = await db.from("product_files").select("*").eq("id", body.fileId).single();
  if (!file || file.product_id !== body.productId) throw new HttpError(404, "Upload record not found", "not_found");
  if (!(await objectExists(String(file.storage_path)))) throw new HttpError(400, "Uploaded object missing", "missing_object");

  // Fetch bytes from private R2 storage using the server SDK (never a public URL).
  const buffer = await getObject(String(file.storage_path));

  const inspected = inspectFile(buffer, body.originalFilename);
  if (inspected.checksum !== body.expectedChecksum || inspected.checksum !== file.checksum) {
    throw new HttpError(400, "Checksum mismatch — file may have been altered", "checksum_mismatch");
  }

  await db.from("products").update({ status: "scanning" }).eq("id", body.productId);

  let outcome;
  try {
    outcome = await scanFile(buffer, body.originalFilename);
  } catch (error) {
    await db.from("product_files").update({
      scan_status: "failed",
      scan_provider: "virustotal",
      scan_result: { error: String(error) },
    }).eq("id", body.fileId);
    await db.from("products").update({
      status: "rejected",
      rejection_reason: "Automated malware scanning failed. Please contact support.",
    }).eq("id", body.productId);
    await audit({ actorId: user.id, actorRole: user.role, action: "upload.scan_failed", targetType: "product", targetId: body.productId });
    throw new HttpError(422, "Malware scanning failed; product rejected", "scan_failed");
  }

  await db.from("product_files").update({
    scan_status: outcome.status,
    scan_provider: outcome.provider,
    scan_result: outcome.result,
  }).eq("id", body.fileId);

  if (outcome.status === "infected") {
    await db.from("products").update({
      status: "rejected",
      rejection_reason: "Malware detected by automated security scanning.",
    }).eq("id", body.productId);
    await audit({ actorId: user.id, actorRole: user.role, action: "upload.malware_detected", targetType: "product", targetId: body.productId, metadata: outcome.result });
    throw new HttpError(422, "Malware detected; product rejected", "malware_detected");
  }

  // Scan passed: seller still cannot publish. Admin review is mandatory.
  await db.from("products").update({ status: "pending_review" }).eq("id", body.productId);
  await audit({ actorId: user.id, actorRole: user.role, action: "upload.scan_clean", targetType: "product", targetId: body.productId });
  return ok({ scanStatus: outcome.status, nextStatus: "pending_review" });
});
