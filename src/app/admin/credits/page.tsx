"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

type Wallet = {
  balance: number;
  pending_balance: number;
  frozen_balance: number;
  currency: string;
};

type Buyer = {
  id: string;
  email: string;
  full_name: string | null;
  credit_wallets: Wallet[] | Wallet | null;
};

type Message = { type: "success" | "error"; text: string };

const ACTIONS = ["grant", "deduct", "freeze", "reverse"] as const;

function walletOf(buyer: Buyer): Wallet | null {
  const wallet = buyer.credit_wallets;
  return Array.isArray(wallet) ? wallet[0] ?? null : wallet;
}

export default function AdminCredits() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [setExpiry, setSetExpiry] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Buyer[]>("/api/admin/credits");
      setBuyers(data);
      setUserId((current) => current || data[0]?.id || "");
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: (typeof ACTIONS)[number]) {
    if (!userId) {
      setMessage({ type: "error", text: "Select a buyer first." });
      return;
    }
    setBusy(action);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/credits/${action}`, {
        method: "POST",
        body: JSON.stringify({ userId, amount, reason, setExpiry }),
      });
      setMessage({ type: "success", text: `${action} applied. The buyer wallet was updated and the action was audited.` });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h1 className="text-2xl font-bold">Credit control</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Buyers purchase or receive credits and spend them at checkout. Sellers receive their net earnings after the
          platform commission, which the admin panel reports as platform fees. Every credit adjustment here is recorded
          in the audit log. 1 credit = $0.01.
        </p>
      </div>

      <div className="card max-w-2xl p-6">
        <h2 className="font-semibold">Adjust a buyer wallet</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="label" htmlFor="credit-buyer">Buyer</label>
            <select
              id="credit-buyer"
              className="input"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={loading}
            >
              <option value="">{loading ? "Loading buyers…" : "Select a buyer"}</option>
              {buyers.map((buyer) => {
                const wallet = walletOf(buyer);
                return (
                  <option key={buyer.id} value={buyer.id}>
                    {buyer.full_name ? `${buyer.full_name} · ${buyer.email}` : buyer.email}
                    {wallet ? ` — ${wallet.balance.toLocaleString()} credits` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="credit-amount">Amount (credits)</label>
            <input
              id="credit-amount"
              className="input"
              type="number"
              min={1}
              max={1_000_000}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
          </div>

          <div>
            <label className="label" htmlFor="credit-reason">Reason (5+ characters)</label>
            <input
              id="credit-reason"
              className="input"
              placeholder="Support adjustment, refund correction…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={setExpiry} onChange={(event) => setSetExpiry(event.target.checked)} />
            Add the standard expiry date to granted credits
          </label>

          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void act(action)}
                disabled={busy !== null}
              >
                {busy === action ? "Working…" : action}
              </button>
            ))}
          </div>

          {message && (
            <p
              className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-700"}`}
              role={message.type === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
