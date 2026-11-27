/** Shared signal so the header bell updates immediately after a mutation. */
export const NOTIFICATIONS_CHANGED_EVENT = "digital-shelf:notifications-changed";

export interface NotificationsChangedDetail {
  unreadCount?: number;
}

/** Broadcast a notification change to every mounted bell on the page. */
export function emitNotificationsChanged(unreadCount?: number): void {
  if (typeof window === "undefined") return;
  const detail: NotificationsChangedDetail = { unreadCount };
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail }));
}
