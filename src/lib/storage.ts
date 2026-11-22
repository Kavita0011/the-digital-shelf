import { getSupabaseAdmin } from "./admin-db";
import { getServerEnv } from "./env";

/**
 * Private product-file storage backed by Supabase Storage.
 *
 * All access is server-side with the service-role client. The browser only
 * ever receives short-lived signed upload/download URLs, so buckets stay
 * private and no object is reachable without passing through the app's RBAC.
 */

function bucket(): string {
  return getServerEnv().SUPABASE_STORAGE_BUCKET;
}

export async function presignUpload(path: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket())
    .createSignedUploadUrl(path, { upsert: true });
  if (error) throw error;
  return data.signedUrl;
}

export async function presignDownload(path: string, ttlSeconds = 600): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from(bucket())
    .createSignedUrl(path, ttlSeconds, { download: "download" });
  if (error) throw error;
  return data.signedUrl;
}

/** Fetch bytes for server-side MIME/checksum inspection and malware scanning. */
export async function getObject(path: string): Promise<Buffer> {
  const { data, error } = await getSupabaseAdmin().storage.from(bucket()).download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

export async function objectExists(path: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().storage.from(bucket()).info(path);
  return !error;
}

export async function deleteObject(path: string): Promise<void> {
  const { error } = await getSupabaseAdmin().storage.from(bucket()).remove([path]);
  if (error) throw error;
}
