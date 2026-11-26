/** Lightweight buyer-facing icons for the category taxonomy. No DB column needed. */
const CATEGORY_ICONS: Record<string, string> = {
  "templates-productivity": "🧩",
  "planners-printables": "🗓️",
  "ebooks-guides": "📚",
  "courses-workshops": "🎓",
  "creative-assets": "🎨",
  "stock-media": "🎬",
  "business-finance-tools": "📊",
  "ai-tech-tools": "🤖",
  "education-teacher-resources": "✏️",
  "bundles-starter-kits": "🎁",
};

export function categoryIcon(slug: string | null | undefined): string {
  return (slug && CATEGORY_ICONS[slug]) || "✨";
}
