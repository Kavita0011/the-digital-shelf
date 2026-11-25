import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextRequest } from "next/server";
import {
  assertCanAssignRole,
  assertCanManageUser,
  HttpError,
  requestIp,
} from "../src/lib/auth";
import type { AuthenticatedUser, Role } from "../src/lib/types";

function actor(id: string, role: Role): AuthenticatedUser {
  return {
    id,
    email: `${id}@example.com`,
    role,
    realRole: role,
    impersonating: false,
    status: "active",
    fullName: null,
  };
}

function reqWithHeaders(headers: Record<string, string>): NextRequest {
  return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } } as unknown as NextRequest;
}

function forbidden(fn: () => void): void {
  assert.throws(fn, (error: unknown) => error instanceof HttpError && error.status === 403);
}

test("an admin cannot manage a peer or a super admin", () => {
  const admin = actor("admin-1", "admin");
  forbidden(() => assertCanManageUser(admin, "admin-2", "admin"));
  forbidden(() => assertCanManageUser(admin, "super-1", "super_admin"));
});

test("a super admin cannot demote another super admin", () => {
  const superAdmin = actor("super-1", "super_admin");
  forbidden(() => assertCanManageUser(superAdmin, "super-2", "super_admin"));
});

test("a super admin can manage lower roles but cannot assign a peer role", () => {
  const superAdmin = actor("super-1", "super_admin");
  assert.doesNotThrow(() => assertCanManageUser(superAdmin, "seller-1", "seller"));
  assert.doesNotThrow(() => assertCanAssignRole(superAdmin, "admin"));
  forbidden(() => assertCanAssignRole(superAdmin, "super_admin"));
});

test("requestIp prefers Cloudflare's connecting IP over forwarded headers", () => {
  const req = reqWithHeaders({
    "cf-connecting-ip": "203.0.113.9",
    "x-real-ip": "198.51.100.4",
    "x-forwarded-for": "192.0.2.1, 10.0.0.1",
  });
  assert.equal(requestIp(req), "203.0.113.9");
});

test("requestIp falls back to the last forwarded hop", () => {
  assert.equal(requestIp(reqWithHeaders({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" })), "10.0.0.1");
  assert.equal(requestIp(reqWithHeaders({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
});
