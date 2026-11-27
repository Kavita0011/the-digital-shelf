"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notification-events";

/** Small header indicator; hidden for visitors who are not signed in. */
export function NotificationBell() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401) {
        setVisible(false);
        return;
      }
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      if (!json?.ok) return;
      setVisible(true);
      setCount(Number(json.data?.unreadCount ?? 0));
    } catch {
      // Keep the last known count; the next navigation or poll will retry.
    }
  }, []);

  // Refresh when the route changes so visiting /notifications or returning to
  // the dashboard never leaves an old badge behind.
  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === "number") {
        setVisible(true);
        setCount(Math.max(0, detail.unreadCount));
      } else {
        void load();
      }
    };
    const onFocus = () => void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);

    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [load]);

  if (!visible) return null;

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:text-brand-600"
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-brand-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
