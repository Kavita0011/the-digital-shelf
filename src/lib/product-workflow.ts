/**
 * Product lifecycle rules shared by the seller API, pages and controls.
 *
 * A seller may edit any product that is not actively scanning. Editing always
 * invalidates the uploaded file and returns the product to draft so it goes
 * through a fresh malware scan and admin review.
 */
export const SELLER_EDITABLE_STATUSES = [
  "draft",
  "rejected",
  "pending_review",
  "approved",
  "hidden",
  "removed",
] as const;

export function canSellerEdit(status: string): boolean {
  return (SELLER_EDITABLE_STATUSES as readonly string[]).includes(status);
}
