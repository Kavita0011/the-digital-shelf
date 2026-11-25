import assert from "node:assert/strict";
import { test } from "node:test";
import { loginSchema, registerSchema } from "../src/lib/validation";

test("login accepts any non-empty stored password", () => {
  const result = loginSchema.safeParse({ email: "testadmin@example.com", password: "password" });
  assert.equal(result.success, true);
});

test("login still rejects missing credentials", () => {
  const result = loginSchema.safeParse({ email: "testadmin@example.com", password: "" });
  assert.equal(result.success, false);
});

test("registration still enforces password strength", () => {
  const input = {
    email: "new@example.com",
    password: "password",
    fullName: "New User",
    role: "buyer" as const,
    acceptedTerms: true,
  };
  assert.equal(registerSchema.safeParse(input).success, false);
  assert.equal(registerSchema.safeParse({ ...input, password: "StrongPass123" }).success, true);
});
