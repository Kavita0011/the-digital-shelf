import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HttpError, requireUser, requestIp } from "@/lib/auth";
import { ALLOWED_MIME_TYPES } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import { assertSafeFilename, safeStoredName, storagePath } from "@/lib/file-security";
import { presignUpload } from "@/lib/r2";
import { audit } from "@/lib/audit";

const bodySchema = z.object({
  productId: z.string().uuid(),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  size: z.number().int().positive().max(Number(process.env.MAX_UPLOAD_BYTES ?? 26_214_400)),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Only sellers can upload products", "forbidden");
  await rateLimit(`upload:${user.id}`, 20, 60 * 60 * 1000);

  const body = bodySchema.parse(await req.json());
  assertSafeFilename(body.originalFilename);

  // Verify the product belongs to this seller and is in an editable state.
  const { data: product } = await getSupabaseAdmin()
    .from("products")
    .select("id,status,seller_id")
    .eq("id", body.productId)
    .single();
  if (!product) throw new HttpError(404, "Product not found", "not_found");
  const { data: seller } = await getSupabaseAdmin()
    .from("seller_profiles").select("id").eq("user_id", user.id).single();
  if (!seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");
  if (!["draft", "rejected"].includes(product.status)) throw new HttpError(409, "Product is not editable", "invalid_state");

  const storedFilename = safeStoredName(body.originalFilename);
  const path = storagePath(seller.id, storedFilename);
  const uploadUrl = await presignUpload(path, body.mimeType, body.size);

  // Create the private file record up-front so /complete can verify + scan it.
  const { data: fileRecord, error: fileError } = await getSupabaseAdmin().from("product_files").insert({
    product_id: body.productId,
    storage_path: path,
    original_filename: body.originalFilename,
    stored_filename: storedFilename,
    mime_type: body.mimeType,
    file_size: body.size,
    checksum: body.checksum,
    scan_status: "pending",
  }).select("id").single();
  if (fileError) throw fileError;

  await getSupabaseAdmin().from("products").update({
    file_id: fileRecord.id, status: "uploading",
    file_format: body.originalFilename.split(".").pop() ?? null,
    file_size: body.size, file_checksum: body.checksum,
  }).eq("id", body.productId);

  await audit({
    actorId: user.id, actorRole: user.role, action: "upload.presigned",
    targetType: "product", targetId: body.productId,
    metadata: { path, originalFilename: body.originalFilename, size: body.size },
    ip: requestIp(req), userAgent: req.headers.get("user-agent"),
  });

  return ok({ uploadUrl, path, storedFilename, fileId: fileRecord.id, expiresInSeconds: 900 });
});
