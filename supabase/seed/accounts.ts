/**
 * Create the super admin and a test user in Supabase.
 *
 * Usage:
 *   1. Copy .env.example to .env.local and fill in:
 *        NEXT_PUBLIC_SUPABASE_URL=...
 *        SUPABASE_SERVICE_ROLE_KEY=...
 *        ADMIN_PASSWORD=<your chosen password, 12+ chars>
 *        TEST_PASSWORD=<your chosen password, 12+ chars>
 *   2. Run: npm run db:accounts
 *
 * Passwords are never printed or stored in the repo. If an account already
 * exists, its role is updated instead of recreating it.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminPassword = process.env.ADMIN_PASSWORD;
const testPassword = process.env.TEST_PASSWORD;

if (!url || !serviceKey || !adminPassword || adminPassword.length < 12 || !testPassword || testPassword.length < 12) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD (12+ chars) and TEST_PASSWORD (12+ chars) in .env.local",
  );
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const ACCOUNTS = [
  { email: "thedigitalshelf.admin@gmail.com", password: adminPassword!, role: "super_admin", name: "Super Admin" },
  { email: "testuser@example.com", password: testPassword!, role: "buyer", name: "Test Buyer" },
] as const;

async function ensureUser(account: (typeof ACCOUNTS)[number]) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.name, role: account.role },
  });

  if (error && !error.message.includes("already registered")) throw error;

  let id: string;
  if (created?.user) {
    id = created.user.id;
  } else {
    const { data: existing, error: lookupError } = await admin
      .from("users")
      .select("id")
      .eq("email", account.email)
      .single();
    if (lookupError || !existing) throw new Error(`Could not find existing user ${account.email}`);
    id = String(existing.id);
  }

  const { error: updateError } = await admin
    .from("users")
    .upsert(
      { id, email: account.email, role: account.role, status: "active", full_name: account.name },
      { onConflict: "id" },
    );
  if (updateError) throw updateError;

  console.log(`Ready: ${account.email} (${account.role})`);
}

async function main() {
  for (const account of ACCOUNTS) await ensureUser(account);
  console.log("Admin and test user are ready. Passwords were read from .env.local and never printed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
