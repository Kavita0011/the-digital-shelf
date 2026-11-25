"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Small header indicator; hidden for visitors who are not signed in. */
export function NotificationBell() {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/notifications", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => (res.ok ? res.json().catch(() => null) : null))
      .then((json) => {
        if (!active || !json?.ok) return;
        setVisible(true);
        setCount(Number(json.data?.unreadCount ?? 0));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

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
