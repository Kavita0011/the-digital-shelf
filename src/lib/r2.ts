import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerEnv } from "./env";

let client: S3Client | null = null;
function s3(): S3Client {
  if (client) return client;
  const env = getServerEnv();
  client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

export async function presignUpload(path: string, mime: string, size: number): Promise<string> {
  const env = getServerEnv();
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: path, ContentType: mime, ContentLength: size }),
    { expiresIn: 900 },
  );
}

export async function presignDownload(path: string, ttlSeconds = 600): Promise<string> {
  const env = getServerEnv();
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: path,
      ResponseContentDisposition: 'attachment; filename="download"',
    }),
    { expiresIn: ttlSeconds },
  );
}

export async function getObject(path: string): Promise<Buffer> {
  const env = getServerEnv();
  const object = await s3().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: path }));
  if (!object.Body) throw new Error("Empty object body");
  return Buffer.from(await object.Body.transformToByteArray());
}

export async function objectExists(path: string): Promise<boolean> {
  try {
    const env = getServerEnv();
    await s3().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: path }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(path: string): Promise<void> {
  const env = getServerEnv();
  await s3().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: path }));
}
