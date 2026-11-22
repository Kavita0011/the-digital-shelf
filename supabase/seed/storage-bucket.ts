import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { ALLOWED_MIME_TYPES } from "../../src/lib/types";

config({ path: ".env.local" });

/** Idempotently create the private bucket used for product files. */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "product-files";
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await supabase.storage.getBucket(bucket);
  if (existing) {
    console.log(`Private bucket '${bucket}' already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: Number(process.env.MAX_UPLOAD_BYTES ?? 26_214_400),
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
  });
  if (error) throw error;
  console.log(`Created private bucket '${bucket}'.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
