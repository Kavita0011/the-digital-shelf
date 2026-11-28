"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_DESCRIPTIONS,
  CONTENT_TYPE_LABELS,
  mimeTypeForFilename,
  type ContentType,
  type ScanStatus,
} from "@/lib/types";

const STEPS = ["Details", "File", "Review & submit"];
const SCAN_TIMEOUT_MS = 15 * 60 * 1000;
const SCAN_POLL_MS = 5_000;
const ALL_FILES = ".pdf,.epub,.png,.jpg,.jpeg,.webp,.zip,.mp4,.mp3,.docx,.xlsx,.pptx";

interface CategoryOption {
  id: string;
  name: string;
  description: string | null;
}

export interface InitialProduct {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  contentType: ContentType | "";
  tags: string[];
  /** Integer credits. Storage value is the same integer (1 credit = $0.01). */
  price: number;
  currency: string;
  licenseType: "personal" | "commercial" | "extended_commercial";
  refundPolicy: string;
  previewImageUrl: string;
  rejectionReason?: string | null;
}

/** Values shared by the create and edit flows; matches productDraftSchema. */
function draftBody(fd: FormData) {
  const preview = String(fd.get("previewImageUrl") ?? "").trim();
  if (preview) {
    try {
      new URL(preview);
    } catch {
      throw new Error("Preview image URL must be a valid URL or left blank");
    }
  }
  return {
    title: fd.get("title"),
    shortDescription: fd.get("shortDescription"),
    description: fd.get("description"),
    categoryId: fd.get("categoryId"),
    contentType: fd.get("contentType"),
    tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    // The seller enters credits directly; the stored integer is already the
    // canonical credit amount. Do not convert it through dollars.
    price: Math.max(0, Math.round(Number(fd.get("price")))),
    currency: "usd",
    licenseType: fd.get("licenseType"),
    refundPolicy: fd.get("refundPolicy"),
    copyrightConfirmed: true,
    safetyPolicyConfirmed: true,
    previewImageUrl: preview || null,
  };
}

export function UploadWizard({ categories, initialProduct }: { categories: CategoryOption[]; initialProduct?: InitialProduct }) {
  const isEdit = Boolean(initialProduct);
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<ContentType | "">(initialProduct?.contentType ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const fd = new FormData(e.currentTarget);
    try {
      const body = draftBody(fd);
      const product = isEdit
        ? await apiFetch<{ id: string }>(`/api/seller/products/${initialProduct!.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await apiFetch<{ id: string }>("/api/seller/products", {
            method: "POST",
            body: JSON.stringify(body),
          });
      setProductId(product.id);
      // Editing invalidates the old file; a fresh upload + scan is mandatory.
      setFile(null);
      setStep(1);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile() {
    if (!file || !productId) return;
    setBusy(true);
    setMessage("Uploading securely…");
    try {
      const checksum = await sha256(file);
      const declaredMime = mimeTypeForFilename(file.name) ?? file.type;
      const presign = await apiFetch<{ uploadUrl: string; path: string; fileId: string }>("/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ productId, originalFilename: file.name, mimeType: declaredMime, size: file.size, checksum }),
      });
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": declaredMime },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");

      setMessage("Submitting file for malware scanning…");
      const scan = await apiFetch<{ scanStatus: ScanStatus; queued?: boolean }>("/api/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ productId, fileId: presign.fileId, path: presign.path, originalFilename: file.name, expectedChecksum: checksum }),
      });

      let status = scan.scanStatus;
      if (status === "scanning") {
        setMessage("Security scan queued. Checking status…");
        status = await waitForScan(presign.fileId);
      }
      if (status !== "clean") throw new Error(`Scan ended with status: ${status}`);
      setStep(2);
      setMessage("Scan passed. Product queued for admin review.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/api/seller/products/${productId}/submit`, { method: "POST" });
      setMessage("Submitted for admin review. Your product is not public yet.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 max-w-3xl p-6">
      <ol className="mb-8 flex gap-4 text-sm">
        {STEPS.map((s, i) => <li key={s} className={i === step ? "font-semibold text-brand-600" : "text-slate-400"}>{i + 1}. {s}</li>)}
      </ol>
      {step === 0 && <form onSubmit={saveDetails} className="space-y-4">
        {isEdit && initialProduct?.rejectionReason && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="status">
            <strong>Moderator feedback:</strong> {initialProduct.rejectionReason}
          </p>
        )}
        {isEdit && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Saving changes invalidates the current file and its scan. You will upload a new file before resubmitting.
          </p>
        )}
        <div><label className="label" htmlFor="product-title">Title</label><input className="input" id="product-title" name="title" required minLength={3} defaultValue={initialProduct?.title} /></div>
        <div><label className="label" htmlFor="product-short-description">Short description</label><input className="input" id="product-short-description" name="shortDescription" required minLength={10} defaultValue={initialProduct?.shortDescription} /></div>
        <div><label className="label" htmlFor="product-description">Full description</label><textarea className="input" id="product-description" name="description" rows={6} required minLength={20} defaultValue={initialProduct?.description} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="product-category">Category</label>
            <select className="input" id="product-category" name="categoryId" required defaultValue={initialProduct?.categoryId ?? ""}>
              <option value="" disabled>Choose a topic</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">What the product is for. Tools and brands belong in tags, not categories.</p>
          </div>
          <div>
            <label className="label" htmlFor="product-content-type">Content type</label>
            <select
              className="input"
              id="product-content-type"
              name="contentType"
              required
              value={contentType}
              onChange={(e) => setContentType(e.target.value as ContentType | "")}
            >
              <option value="" disabled>Choose a format</option>
              {CONTENT_TYPES.map((type) => <option key={type} value={type}>{CONTENT_TYPE_LABELS[type]}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">What the buyer gets and how they use it — not the file extension.</p>
          </div>
        </div>
        {contentType && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">{CONTENT_TYPE_DESCRIPTIONS[contentType]}</p>}
        {categories.length === 0 && <p className="text-sm text-red-600">No categories are configured yet. Ask an admin to apply the category taxonomy migration.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="product-price">Price (credits)</label>
            <input
              className="input"
              id="product-price"
              name="price"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={initialProduct?.price ?? undefined}
            />
            <p className="mt-1 text-xs text-slate-500">Buyers pay with credits. 1 credit = $0.01.</p>
          </div>
          <div><label className="label" htmlFor="product-tags">Tags (comma separated)</label><input className="input" id="product-tags" name="tags" placeholder="notion, budgeting, beginner" defaultValue={initialProduct?.tags.join(", ")} /></div>
        </div>
        <div>
          <label className="label" htmlFor="product-preview-url">Preview image URL (optional)</label>
          <input className="input" id="product-preview-url" name="previewImageUrl" type="url" placeholder="https://example.com/preview.png" defaultValue={initialProduct?.previewImageUrl ?? ""} />
          <p className="mt-1 text-xs text-slate-500">Leave blank if you do not have a preview image.</p>
        </div>
        <div><label className="label" htmlFor="product-license">License type</label><select className="input" id="product-license" name="licenseType" defaultValue={initialProduct?.licenseType ?? "personal"}><option value="personal">Personal use</option><option value="commercial">Commercial use</option><option value="extended_commercial">Extended commercial use</option></select></div>
        <div><label className="label" htmlFor="product-refund-policy">Refund / support policy</label><textarea className="input" id="product-refund-policy" name="refundPolicy" rows={3} required minLength={10} defaultValue={initialProduct?.refundPolicy ?? ""} /></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" required /> I confirm copyright ownership and accept the upload safety policy.</label>
        <button className="btn" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes & continue" : "Continue to file upload"}</button>
      </form>}
      {step === 1 && <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {isEdit && "Your previous file was invalidated. Upload a new file for scanning. "}
          {contentType === "ebook"
            ? "Ebooks work best as EPUB or PDF. Use ZIP only when the ebook includes extra files. Max 25 MB."
            : "PDF, EPUB, PNG, JPG, WEBP, ZIP, MP4, MP3, DOCX, XLSX or PPTX · max 25 MB."}
        </p>
        <div>
          <label className="label" htmlFor="product-file">Product file</label>
          <input
            className="input"
            id="product-file"
            aria-label="Product file"
            type="file"
            accept={contentType === "ebook" ? ".epub,.pdf,.zip" : ALL_FILES}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <button className="btn" disabled={!file || busy} onClick={uploadFile}>{busy ? "Processing…" : "Upload & scan"}</button>
      </div>}
      {step === 2 && <div><p className="text-slate-600">Your file passed automated scanning. Submit it for mandatory admin review.</p><button className="btn mt-4" disabled={busy} onClick={submitForReview}>Submit for review</button></div>}
      {message && <p className="mt-4 text-sm text-slate-700" role="status">{message}</p>}
    </div>
  );
}

async function waitForScan(fileId: string): Promise<ScanStatus> {
  const deadline = Date.now() + SCAN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(SCAN_POLL_MS);
    const data = await apiFetch<{ scan_status: ScanStatus; scan_result?: Record<string, unknown> | null }>(
      `/api/uploads/${fileId}/scan-status`,
    );
    const status = data.scan_status;
    if (status === "clean" || status === "infected" || status === "failed" || status === "skipped") return status;
  }
  throw new Error("Malware scan timed out. Please try again later.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
