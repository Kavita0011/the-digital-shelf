import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { emitNotificationsChanged, NOTIFICATIONS_CHANGED_EVENT } from "../src/lib/notification-events";

test("notification changes broadcast the new unread count", () => {
  const events: Array<{ type: string; detail: unknown }> = [];
  const global = globalThis as Record<string, unknown>;
  const previousWindow = global.window;
  const previousCustomEvent = global.CustomEvent;

  global.CustomEvent = class {
    constructor(public type: string, public init: { detail?: unknown } = {}) {}
    get detail() { return this.init.detail; }
  };
  global.window = {
    dispatchEvent(event: { type: string; detail: unknown }) {
      events.push(event);
      return true;
    },
  };

  try {
    emitNotificationsChanged(4);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, NOTIFICATIONS_CHANGED_EVENT);
    assert.deepEqual(events[0].detail, { unreadCount: 4 });
  } finally {
    global.window = previousWindow;
    global.CustomEvent = previousCustomEvent;
  }
});

test("mark-read API returns refreshed state and the bell subscribes to changes", () => {
  const root = process.cwd();
  const api = readFileSync(join(root, "src/app/api/notifications/route.ts"), "utf8");
  const bell = readFileSync(join(root, "src/components/notification-bell.tsx"), "utf8");
  const page = readFileSync(join(root, "src/app/notifications/page.tsx"), "utf8");

  assert.match(api, /return ok\(\{ updated: true, \.\.\.result \}\)/);
  assert.match(bell, /usePathname/);
  assert.match(bell, /NOTIFICATIONS_CHANGED_EVENT/);
  assert.match(bell, /visibilitychange/);
  assert.match(page, /emitNotificationsChanged\(result\.unreadCount\)|applyData\(result\)/);
});
