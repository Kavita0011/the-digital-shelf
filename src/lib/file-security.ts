import { createHash, randomUUID } from "node:crypto";
import { ALLOWED_MIME_TYPES, BLOCKED_EXTENSIONS, type AllowedMimeType } from "./types";
import { HttpError } from "./auth";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 104_857_600); // 100 MB

/** Magic-byte signatures. ZIP-based Office formats need deeper inspection. */
const MAGIC: Array<{ mime: AllowedMimeType; bytes: number[]; offset?: number }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "video/mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }, // ftyp
  { mime: "audio/mpeg", bytes: [0x49, 0x44, 0x33] }, // ID3 (common MP3)
];

const OFFICE_SIGS: Record<string, string> = {
  "word/": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "xl/": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "ppt/": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface InspectedFile {
  buffer: Buffer;
  detectedMime: AllowedMimeType;
  checksum: string;
  size: number;
}

/** Detect real MIME from bytes; never trust filename or Content-Type alone. */
export function detectMime(buffer: Buffer): AllowedMimeType | null {
  for (const sig of MAGIC) {
    const start = sig.offset ?? 0;
    if (buffer.length >= start + sig.bytes.length &&
        sig.bytes.every((b, i) => buffer[start + i] === b)) {
      if (sig.mime === "image/webp") {
        return buffer.subarray(8, 12).toString("ascii") === "WEBP" ? sig.mime : null;
      }
      if (sig.mime === "video/mp4") return sig.mime;
      if (sig.mime === "application/zip") return inspectZipOffice(buffer) ?? sig.mime;
      return sig.mime;
    }
  }
  // MP3 without ID3: frame sync
  if (buffer.length > 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}

function inspectZipOffice(buffer: Buffer): AllowedMimeType | null {
  const head = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("latin1");
  for (const [marker, mime] of Object.entries(OFFICE_SIGS)) {
    if (head.includes(marker)) return mime as AllowedMimeType;
  }
  return "application/zip";
}

export function assertSafeFilename(originalName: string): void {
  const lower = originalName.toLowerCase();
  if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new HttpError(400, `Blocked file extension: ${extFromName(originalName)}`, "blocked_file_type");
  }
  if (!/\.[a-z0-9]{1,8}$/i.test(originalName)) {
    throw new HttpError(400, "Unknown or missing file extension", "unknown_file_type");
  }
  // Prevent path traversal / control characters in stored metadata.
  if (/[\\/\0-\x1f]/.test(originalName)) {
    throw new HttpError(400, "Invalid filename", "invalid_filename");
  }
}

function extFromName(name: string) { return name.slice(name.lastIndexOf(".")).toLowerCase(); }

/** Full server-side validation of an uploaded file buffer. */
export function inspectFile(buffer: Buffer, originalName: string): InspectedFile {
  assertSafeFilename(originalName);
  if (buffer.length === 0) throw new HttpError(400, "Empty file", "empty_file");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "File exceeds 100 MB limit", "file_too_large");
  const detectedMime = detectMime(buffer);
  if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
    throw new HttpError(400, "Unsupported or unrecognized file content", "unsupported_file_type");
  }
  return {
    buffer,
    detectedMime,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    size: buffer.length,
  };
}

/** UUID-based stored name. Original name is kept only as metadata. */
export function safeStoredName(originalName: string): string {
  const ext = extFromName(originalName).replace(/[^.a-z0-9]/g, "");
  return `${randomUUID()}${ext}`;
}

export function storagePath(sellerId: string, storedName: string): string {
  return `sellers/${sellerId}/products/${storedName}`;
}
