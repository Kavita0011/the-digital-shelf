"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { ScanStatus } from "@/lib/types";

const STEPS = ["Details", "File", "Review & submit"];
const SCAN_TIMEOUT_MS = 15 * 60 * 1000;
const SCAN_POLL_MS = 5_000;

export function UploadWizard() {
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createDraft(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    const fd = new FormData(e.currentTarget);
    try {
      const product = await apiFetch<{ id: string }>("/api/seller/products", {
        method: "POST",
        body: JSON.stringify({
          title: fd.get("title"), shortDescription: fd.get("shortDescription"), description: fd.get("description"),
          categoryId: fd.get("categoryId") || null, tags: String(fd.get("tags") ?? "").split(",").map(t=>t.trim()).filter(Boolean),
          price: Math.round(Number(fd.get("price")) * 100), currency: "usd", licenseType: fd.get("licenseType"),
          refundPolicy: fd.get("refundPolicy"), copyrightConfirmed: true, safetyPolicyConfirmed: true,
        }),
      });
      setProductId(product.id); setStep(1);
    } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); }
  }

  async function uploadFile() {
    if (!file || !productId) return;
    setBusy(true); setMessage("Uploading securely…");
    try {
      const checksum = await sha256(file);
      const presign = await apiFetch<{ uploadUrl: string; path: string; fileId: string }>("/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ productId, originalFilename: file.name, mimeType: file.type, size: file.size, checksum }),
      });
      const put = await fetch(presign.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
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
      setStep(2); setMessage("Scan passed. Product queued for admin review.");
    } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); }
  }

  async function submitForReview() {
    setBusy(true); setMessage("");
    try {
      await apiFetch(`/api/seller/products/${productId}/submit`, { method: "POST" });
      setMessage("Submitted for admin review. Your product is not public yet.");
    } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card mt-6 max-w-3xl p-6">
      <ol className="mb-8 flex gap-4 text-sm">
        {STEPS.map((s,i)=><li key={s} className={i===step?"font-semibold text-brand-600":"text-slate-400"}>{i+1}. {s}</li>)}
      </ol>
      {step === 0 && <form onSubmit={createDraft} className="space-y-4">
        <div><label className="label">Title</label><input className="input" name="title" required minLength={3} /></div>
        <div><label className="label">Short description</label><input className="input" name="shortDescription" required minLength={10} /></div>
        <div><label className="label">Full description</label><textarea className="input" name="description" rows={6} required minLength={20} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Category ID (optional)</label><input className="input" name="categoryId" placeholder="uuid" /></div>
          <div><label className="label">Price (USD)</label><input className="input" name="price" type="number" min="0" step="0.01" required /></div>
        </div>
        <div><label className="label">Tags (comma separated)</label><input className="input" name="tags" /></div>
        <div><label className="label">License type</label><select className="input" name="licenseType"><option value="personal">Personal use</option><option value="commercial">Commercial use</option><option value="extended_commercial">Extended commercial use</option></select></div>
        <div><label className="label">Refund / support policy</label><textarea className="input" name="refundPolicy" rows={3} required minLength={10} /></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" required /> I confirm copyright ownership and accept the upload safety policy.</label>
        <button className="btn" disabled={busy}>{busy?"Saving…":"Continue to file upload"}</button>
      </form>}
      {step === 1 && <div className="space-y-4">
        <p className="text-sm text-slate-600">PDF, PNG, JPG, WEBP, ZIP, MP4, MP3, DOCX, XLSX or PPTX · max 25 MB.</p>
        <input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.zip,.mp4,.mp3,.docx,.xlsx,.pptx" onChange={e=>setFile(e.target.files?.[0]??null)} />
        <button className="btn" disabled={!file||busy} onClick={uploadFile}>{busy?"Processing…":"Upload & scan"}</button>
      </div>}
      {step === 2 && <div><p className="text-slate-600">Your file passed automated scanning. Submit it for mandatory admin review.</p><button className="btn mt-4" disabled={busy} onClick={submitForReview}>Submit for review</button></div>}
      {message && <p className="mt-4 text-sm text-slate-700">{message}</p>}
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
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
