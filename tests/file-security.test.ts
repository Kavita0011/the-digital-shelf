import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertDeclaredMime,
  assertSafeFilename,
  detectMime,
  inspectFile,
  safeStoredName,
} from "../src/lib/file-security";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const pdf = Buffer.from("%PDF-1.7\nfake-content", "latin1");
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

test("magic bytes determine the real MIME type", () => {
  assert.equal(detectMime(png), "image/png");
  assert.equal(detectMime(pdf), "application/pdf");
  assert.equal(detectMime(zip), "application/zip");
  assert.equal(detectMime(Buffer.from("not a file")), null);
});

test("blocked and traversal filenames are rejected", () => {
  assert.throws(() => assertSafeFilename("payload.exe"));
  assert.throws(() => assertSafeFilename("../../etc/passwd.png"));
  assert.doesNotThrow(() => assertSafeFilename("cover.png"));
});

test("declared MIME must match detected content", () => {
  assert.doesNotThrow(() => assertDeclaredMime("image/png", "image/png"));
  assert.throws(() => assertDeclaredMime("image/png", "application/zip"));
});

test("inspection computes a sha256 checksum and a UUID storage name", () => {
  const result = inspectFile(png, "cover.png");
  assert.equal(result.checksum.length, 64);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.match(safeStoredName("cover.png"), /^[0-9a-f-]{36}\.png$/);
});
