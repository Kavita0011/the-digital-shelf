"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { emitNotificationsChanged } from "@/lib/notification-events";
import type { Notification } from "@/lib/types";

type NotificationResponse = {
  notifications: Notification[];
  unreadCount: number;
};

type MarkReadResponse = NotificationResponse & { updated: boolean };

const TYPE_LABELS: Record<Notification["type"], string> = {
  order: "Order",
  payment: "Payment",
  credit: "Credits",
  product: "Product",
  seller: "Seller",
  report: "Report",
  account: "Account",
  system: "System",
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function NotificationsPage() {
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const applyData = useCallback((next: NotificationResponse) => {
    setData(next);
    emitNotificationsChanged(next.unreadCount);
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      applyData(await apiFetch<NotificationResponse>("/api/notifications"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [applyData]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(payload: { id?: string; all?: boolean }) {
    setBusy(true);
    setError("");
    try {
      // The API returns the refreshed list and count, so the UI and the header
      // bell cannot disagree after a successful mark-read.
      const result = await apiFetch<MarkReadResponse>("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      applyData(result);
    } catch (err) {
      setError((err as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div className="container-page max-w-3xl py-12" role="alert">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <p className="card mt-6 p-6 text-sm text-red-600">{error}</p>
        <button className="btn-ghost mt-4" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="container-page max-w-3xl py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="mt-2 text-sm text-slate-600">
            {unreadCount > 0 ? `${unreadCount} unread` : "You are all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => void markRead({ all: true })}
          >
            {busy ? "Working…" : "Mark all read"}
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

      {!data ? (
        <p className="mt-6 text-slate-500">Loading…</p>
      ) : notifications.length === 0 ? (
        <div className="card mt-6 p-6 text-slate-500">
          <p>No notifications yet.</p>
          <p className="mt-2 text-sm">You will see order, credit, payment, product, and account updates here.</p>
        </div>
      ) : (
        <ul className="card mt-6 divide-y">
          {notifications.map((notification) => {
            const href = notification.link?.startsWith("/") ? notification.link : null;
            return (
              <li key={notification.id} className={`p-4 ${notification.read_at ? "" : "bg-brand-50/40"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {TYPE_LABELS[notification.type] ?? notification.type}
                      </span>
                      {notification.title}
                      {!notification.read_at && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}
                    </p>
                    {notification.body && <p className="mt-2 text-sm text-slate-600">{notification.body}</p>}
                    <p className="mt-2 text-xs text-slate-500">{formatDate(notification.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {href && <Link className="text-sm font-medium text-brand-600 hover:underline" href={href}>Open</Link>}
                    {!notification.read_at && (
                      <button
                        type="button"
                        className="text-xs font-medium text-slate-600 hover:text-brand-600 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void markRead({ id: notification.id })}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
