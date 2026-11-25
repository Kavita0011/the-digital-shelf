/**
 * Create the super admin and test buyer/seller accounts in Supabase.
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
 * exists, its role is updated instead of recreating it. The seller profile is
 * approved so the seller dashboard and admin view-as mode are usable immediately.
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
  { email: "testseller@example.com", password: testPassword!, role: "seller", name: "Test Seller" },
] as const;

type Account = (typeof ACCOUNTS)[number];

async function ensureUser(account: Account): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.name, role: account.role },
  });

  if (error && !error.message.toLowerCase().includes("already")) throw error;

  let id: string;
  if (created?.user) {
    id = created.user.id;
  } else {
    // User exists in Auth but may not have a public.users row yet.
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const match = listed?.users.find((u) => u.email?.toLowerCase() === account.email.toLowerCase());
    if (!match) throw new Error(`Could not find existing user ${account.email}`);
    id = match.id;
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: { full_name: account.name, role: account.role },
  });
  if (metadataError) throw metadataError;

  const { error: updateError } = await admin
    .from("users")
    .upsert(
      { id, email: account.email, role: account.role, status: "active", full_name: account.name },
      { onConflict: "id" },
    );
  if (updateError) throw updateError;

  console.log(`Ready: ${account.email} (${account.role})`);
  return id;
}

async function main() {
  const ids: Record<string, string> = {};
  for (const account of ACCOUNTS) ids[account.email] = await ensureUser(account);

  const adminUserId = ids["thedigitalshelf.admin@gmail.com"];
  const buyerId = ids["testuser@example.com"];
  const sellerId = ids["testseller@example.com"];

  const { error: buyerProfileError } = await admin
    .from("buyer_profiles")
    .upsert([{ user_id: buyerId }, { user_id: adminUserId }], { onConflict: "user_id" });
  if (buyerProfileError) throw buyerProfileError;

  // The super-admin account needs an approved seller profile so view-as seller
  // mode can open the seller dashboard instead of failing profile lookups.
  const { error: sellerProfileError } = await admin
    .from("seller_profiles")
    .upsert(
      [
        {
          user_id: sellerId,
          store_name: "The Digital Shelf Test Store",
          bio: "Approved test seller account for demos and QA.",
          verification_status: "approved",
          payout_status: "not_connected",
        },
        {
          user_id: adminUserId,
          store_name: "Admin Preview Store",
          bio: "Internal profile used by super-admin view-as seller mode.",
          verification_status: "approved",
          payout_status: "not_connected",
        },
      ],
      { onConflict: "user_id" },
    );
  if (sellerProfileError) throw sellerProfileError;

  console.log("Admin, buyer, and seller accounts are ready. Passwords were read from .env.local and never printed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
