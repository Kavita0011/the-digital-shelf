import assert from "node:assert/strict";
import { test } from "node:test";
import { loginSchema, productDraftSchema, registerSchema } from "../src/lib/validation";

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

const validDraft = {
  title: "Focus Planner",
  shortDescription: "A simple weekly planning system.",
  description: "A practical planner with weekly pages, priorities and review prompts for busy people.",
  categoryId: "81871e7b-f90b-4eed-8261-f8f809915798",
  contentType: "planner_printable" as const,
  tags: ["planner"],
  price: 1200,
  currency: "usd",
  licenseType: "personal" as const,
  refundPolicy: "Contact support within 14 days for help.",
  copyrightConfirmed: true,
  safetyPolicyConfirmed: true,
};

test("product drafts require a known content type", () => {
  assert.equal(productDraftSchema.safeParse(validDraft).success, true);
  assert.equal(productDraftSchema.safeParse({ ...validDraft, contentType: "pdf" }).success, false);
  assert.equal(productDraftSchema.safeParse({ ...validDraft, contentType: undefined }).success, false);
});

test("product drafts require a category", () => {
  assert.equal(productDraftSchema.safeParse({ ...validDraft, categoryId: undefined }).success, false);
});
