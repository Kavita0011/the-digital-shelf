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

/**
 * What the buyer is getting, not the technical file extension. Categories
 * answer "what is this for?"; content types answer "how do I use it?".
 * Keep this list in sync with supabase/migrations/0009_product_taxonomy.sql.
 */
export const CONTENT_TYPES = [
  "ebook",
  "template",
  "planner_printable",
  "course_workshop",
  "creative_asset",
  "stock_media",
  "spreadsheet_tracker",
  "ai_prompt_pack",
  "bundle_starter_kit",
  "digital_tool",
  "document",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  ebook: "Ebook / guide",
  template: "Editable template",
  planner_printable: "Planner / printable",
  course_workshop: "Course / workshop",
  creative_asset: "Creative asset",
  stock_media: "Stock media",
  spreadsheet_tracker: "Spreadsheet / tracker",
  ai_prompt_pack: "AI prompt pack",
  bundle_starter_kit: "Bundle / starter kit",
  digital_tool: "Digital tool",
  document: "Document / form",
};

export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentType, string> = {
  ebook: "A readable ebook or guide you can follow cover to cover.",
  template: "A ready-made layout you open and customize for your own use.",
  planner_printable: "A page set you print, write on, or use digitally each day.",
  course_workshop: "Structured lessons, videos, or exercises that teach a skill.",
  creative_asset: "Graphics, icons, mockups, or elements for a creative project.",
  stock_media: "Photos, clips, audio, or other ready-to-use media files.",
  spreadsheet_tracker: "A workbook for tracking, budgeting, or calculating.",
  ai_prompt_pack: "Prompts and instructions for a repeatable AI workflow.",
  bundle_starter_kit: "Several complementary resources packaged together.",
  digital_tool: "A usable tool, dashboard, or app rather than a static file.",
  document: "A resume, contract, checklist, or printable form.",
};

export function contentTypeLabel(value: unknown): string {
  return typeof value === "string" && value in CONTENT_TYPE_LABELS
    ? CONTENT_TYPE_LABELS[value as ContentType]
    : "Digital product";
}

export function contentTypeDescription(value: unknown): string {
  return typeof value === "string" && value in CONTENT_TYPE_DESCRIPTIONS
    ? CONTENT_TYPE_DESCRIPTIONS[value as ContentType]
    : "A ready-to-use digital resource delivered after purchase.";
}

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/epub+zip",
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

const MIME_BY_EXTENSION: Record<string, AllowedMimeType> = {
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Canonical MIME for a filename; browsers often leave file.type empty for EPUB. */
export function mimeTypeForFilename(filename: string): AllowedMimeType | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? null;
}

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
  content_type: ContentType | null;
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
