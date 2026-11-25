// Shared domain types. Keep in sync with supabase/migrations/0001_init.sql.

export const ROLES = ["buyer", "seller", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["active", "suspended", "banned", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PRODUCT_STATUSES = [
  "draft",
  "uploading",
  "scanning",
  "pending_review",
  "approved",
  "rejected",
  "hidden",
  "removed",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/zip",
  "video/mp4",
  "audio/mpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".sh", ".js", ".apk", ".dll", ".scr", ".msi", ".ps1",
] as const;

export type ScanStatus = "pending" | "scanning" | "clean" | "infected" | "failed" | "skipped";
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "partially_refunded", "disputed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type CreditTransactionType =
  | "purchase" | "refund" | "admin_grant" | "admin_deduction"
  | "promotional_bonus" | "referral_bonus" | "reversal" | "expiry";
export type CreditTransactionStatus = "completed" | "pending" | "reversed" | "expired" | "frozen";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SellerProfile {
  id: string;
  user_id: string;
  store_name: string;
  bio: string | null;
  profile_image: string | null;
  stripe_connect_account_id: string | null;
  payout_status: string;
  verification_status: string;
  upload_limit: number;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface Product {
  id: string;
  seller_id: string;
  title: string;
  slug: string;
  description: string;
  short_description: string;
  category_id: string | null;
  tags: string[];
  price: number; // integer minor units (cents)
  currency: string;
  status: ProductStatus;
  rejection_reason: string | null;
  preview_image_url: string | null;
  file_id: string | null;
  file_format: string | null;
  file_size: number | null;
  file_checksum: string | null;
  license_type: "personal" | "commercial" | "extended_commercial";
  is_featured: boolean;
  download_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface ProductFile {
  id: string;
  product_id: string;
  storage_path: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: number;
  checksum: string;
  scan_status: ScanStatus;
  scan_analysis_id: string | null;
  scan_provider: string | null;
  scan_result: Record<string, unknown> | null;
  uploaded_at: string;
}

export interface AuditContext {
  actorId: string | null;
  actorRole: Role | "anonymous";
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Effective role. Changes during a signed super-admin impersonation. */
  role: Role;
  /** Stored role, never changed by impersonation. */
  realRole: Role;
  impersonating: boolean;
  status: UserStatus;
  fullName: string | null;
}

export type NotificationType =
  | "order" | "payment" | "credit" | "product" | "seller" | "report" | "account" | "system";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
