import { z } from "zod";

export const email = z.string().trim().toLowerCase().email().max(255);
export const password = z.string().min(12).max(128).regex(/[A-Z]/, "uppercase").regex(/[a-z]/, "lowercase").regex(/[0-9]/, "digit");
export const uuid = z.string().uuid();
export const money = z.number().int().nonnegative();

export const registerSchema = z.object({
  email,
  password,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["buyer", "seller"]).default("buyer"),
  acceptedTerms: z.literal(true),
});

/** Login must accept any stored password; strength is enforced at set/register time. */
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

export const sellerProfileSchema = z.object({
  storeName: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(2000).optional(),
  acceptedTerms: z.literal(true),
  copyrightDeclaration: z.literal(true),
  safetyPolicy: z.literal(true),
});

export const productDraftSchema = z.object({
  title: z.string().trim().min(3).max(200),
  shortDescription: z.string().trim().min(10).max(300),
  description: z.string().trim().min(20).max(20000),
  categoryId: uuid.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  price: z.number().int().min(0).max(1_000_000),
  currency: z.string().length(3).regex(/^[a-z]{3}$/).default("usd"),
  licenseType: z.enum(["personal", "commercial", "extended_commercial"]),
  refundPolicy: z.string().trim().min(10).max(2000),
  copyrightConfirmed: z.literal(true),
  safetyPolicyConfirmed: z.literal(true),
  previewImageUrl: z.string().url().nullable().optional(),
});
