"use client";
import { useState } from "react";
import { z } from "zod";
import { AdminTable } from "@/components/admin-table";
import { apiFetch } from "@/lib/client-api";
import { uuid } from "@/lib/validation";

const formSchema = z.object({
  orderId: uuid,
  reason: z.string().trim().min(5, "Reason must be at least 5 characters").max(1000),
  amountDollars: z.union([z.literal(""), z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a dollar amount such as 12.50")]),
});

function describeError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the form fields";
  return error instanceof Error ? error.message : "Could not issue refund";
}

export default function AdminRefunds() {
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [restoreCredits, setRestoreCredits] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tableVersion, setTableVersion] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const form = formSchema.parse({ orderId, reason, amountDollars });
      const amount = form.amountDollars ? Math.round(Number(form.amountDollars) * 100) : undefined;
      if (amount !== undefined && amount <= 0) throw new Error("Amount must be greater than zero");
      const refund = await apiFetch<{ refunded: number }>("/api/admin/refunds", {
        method: "POST",
        body: JSON.stringify({
          orderId: form.orderId,
          reason: form.reason,
          restoreCredits,
          ...(amount !== undefined ? { amount } : {}),
        }),
      });
      setMessage(`Refund issued: $${(refund.refunded / 100).toFixed(2)}.`);
      setOrderId("");
      setReason("");
      setAmountDollars("");
      setRestoreCredits(true);
      // Remounting AdminTable runs its load effect, refreshing the refund list.
      setTableVersion((version) => version + 1);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Refunds</h1>
      <p className="text-sm text-slate-500">
        Refunds issued from Stripe appear here. Use the form below to issue a new refund for a paid order.
      </p>

      <form className="card grid gap-4 p-5 sm:grid-cols-2" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="orderId">Order ID</label>
          <input
            className="input" id="orderId" name="orderId" required
            placeholder="00000000-0000-0000-0000-000000000000"
            value={orderId} onChange={(e) => setOrderId(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount (USD, optional)</label>
          <input
            className="input" id="amount" name="amount" inputMode="decimal"
            placeholder="Leave blank to refund the full outstanding amount"
            value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="reason">Reason</label>
          <textarea
            className="input" id="reason" name="reason" rows={3} required
            placeholder="Why is this order being refunded?"
            value={reason} onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox" id="restoreCredits" name="restoreCredits"
            checked={restoreCredits} onChange={(e) => setRestoreCredits(e.target.checked)}
          />
          <label className="text-sm text-slate-700" htmlFor="restoreCredits">Restore credits used on this order</label>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Issuing refund…" : "Issue refund"}</button>
          {message && <p className="text-sm text-green-700" role="status">{message}</p>}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
      </form>

      <AdminTable
        key={tableVersion}
        endpoint="/api/admin/refunds"
        columns={["order_id", "amount", "reason", "status", "stripe_refund_id", "created_at"]}
      />
    </div>
  );
}
