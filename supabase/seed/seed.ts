/**
 * Seed demo data. Run: npm run db:seed
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 * IMPORTANT: demo passwords come from DEMO_PASSWORD env var (min 12 chars).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const demoPassword = process.env.DEMO_PASSWORD;
if (!url || !serviceKey || !demoPassword || demoPassword.length < 12) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (12+ chars)");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function createUser(email: string, role: "buyer" | "seller" | "admin" | "super_admin", fullName: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: demoPassword!, email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error && !error.message.includes("already registered")) throw error;
  if (data?.user) {
    await admin.from("users").update({ role, status: "active" }).eq("id", data.user.id);
  }
  const { data: row } = await admin.from("users").select("id").eq("email", email).single();
  return row!.id as string;
}

async function main() {
  const sellerUserId = await createUser("seller@example.com", "seller", "Demo Seller");
  const buyerUserId = await createUser("buyer@example.com", "buyer", "Demo Buyer");
  const adminUserId = await createUser("admin@example.com", "admin", "Demo Admin");
  await createUser("thedigitalshelf.admin@gmail.com", "super_admin", "Demo Super Admin");

  const { data: seller } = await admin.from("seller_profiles")
    .upsert({ user_id: sellerUserId, store_name: "Shelf Studio", bio: "Curated templates", verification_status: "approved" }, { onConflict: "user_id" })
    .select().single();

  await admin.from("buyer_profiles").upsert({ user_id: buyerUserId }, { onConflict: "user_id" });

  const { data: category } = await admin.from("categories").select("id").eq("slug", "planners-printables").single();

  const demoProducts = [
    { title: "Ultimate Notion Planner", short: "A complete productivity system for Notion users.", price: 1900, status: "approved", contentType: "planner_printable" },
    { title: "Minimalist Resume Kit", short: "Clean, ATS-friendly resume templates.", price: 1200, status: "pending_review", contentType: "document" },
    { title: "Social Media Starter Pack", short: "30 editable templates for modern brands.", price: 2900, status: "rejected", contentType: "template", rejection_reason: "Preview image quality too low." },
  ];
  for (const p of demoProducts) {
    const slug = `${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-demo`;
    const { data: existing } = await admin.from("products").select("id").eq("slug", slug).single();
    if (existing) continue;
    await admin.from("products").insert({
      seller_id: seller!.id,
      title: p.title,
      slug,
      description: `${p.short} Includes detailed instructions, editable source files, and lifetime updates. Designed for creators who value clean layout and practical structure.`,
      short_description: p.short,
      category_id: category?.id ?? null,
      content_type: p.contentType,
      tags: ["template", "productivity"],
      price: p.price,
      currency: "usd",
      status: p.status,
      rejection_reason: "rejection_reason" in p ? (p as { rejection_reason?: string }).rejection_reason ?? null : null,
      license_type: "commercial",
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: adminUserId, actor_role: "admin", action: "seed.completed",
    target_type: "system", target_id: "seed", metadata: { generatedAt: new Date().toISOString() },
  });
  console.log("Seed complete. Demo password from DEMO_PASSWORD used for all demo accounts.");
}

main().catch((e) => { console.error(e); process.exit(1); });
