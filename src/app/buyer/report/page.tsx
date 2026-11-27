"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export default function ReportProduct() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/buyer/reports", {
        method: "POST",
        body: JSON.stringify({
          productId: fd.get("productId"),
          reason: fd.get("reason"),
          details: fd.get("details"),
        }),
      });
      setTone("success");
      setMessage("Report submitted for admin review.");
    } catch (err) {
      setTone("error");
      setMessage((err as Error).message || "Could not submit the report. Please try again.");
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Report a product</h1>
      <form onSubmit={submit} className="card mt-6 max-w-xl space-y-4 p-6">
        <div>
          <label className="block text-sm font-medium" htmlFor="productId">Product UUID</label>
          <p className="mt-1 text-xs text-slate-500" id="productId-hint">
            Copy the UUID from the product page URL, for example 123e4567-e89b-12d3-a456-426614174000.
          </p>
          <input
            className="input mt-2"
            id="productId"
            name="productId"
            placeholder="123e4567-e89b-12d3-a456-426614174000"
            aria-describedby="productId-hint"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="reason">Reason</label>
          <select className="input mt-2" id="reason" name="reason" defaultValue="" required>
            <option value="" disabled>Choose a reason</option>
            <option value="copyright">Copyright</option>
            <option value="malware">Malware</option>
            <option value="misleading">Misleading info</option>
            <option value="quality">Quality</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="details">Details</label>
          <p className="mt-1 text-xs text-slate-500" id="details-hint">
            Describe the issue in at least 10 characters so admins can investigate. Do not include passwords or payment details.
          </p>
          <textarea
            className="input mt-2"
            id="details"
            name="details"
            rows={5}
            minLength={10}
            placeholder="What did you find, and why should this product be reviewed?"
            aria-describedby="details-hint"
            required
          />
        </div>
        <button className="btn" type="submit">Submit report</button>
        {message && (
          <p
            className={`text-sm ${tone === "error" ? "text-red-600" : "text-green-700"}`}
            role={tone === "error" ? "alert" : "status"}
            aria-live={tone === "error" ? "assertive" : "polite"}
          >
            {message}
          </p>
        )}
      </form>
    </>
  );
}
