// Applies the branded confirmation email template via the Supabase Management API.
// Requires a real SUPABASE_ACCESS_TOKEN (do not commit it) and a project with
// custom SMTP configured or a paid plan; the free default mailer rejects template edits.
//
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/apply-email-template.mjs [project-ref]

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN before running this script.");
  process.exit(1);
}

const projectRef = process.argv[2] ?? "zqmgfthzieeummmxadgi";
const templatePath = resolve(dirname(fileURLToPath(import.meta.url)), "../supabase/email-templates/confirm-signup.html");
const content = await readFile(templatePath, "utf8");

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    mailer_subjects_confirmation: "Confirm your The Digital Shelf email",
    mailer_templates_confirmation_content: content,
  }),
});

const body = await response.text();
if (!response.ok) {
  console.error(`Failed (${response.status}): ${body}`);
  process.exit(1);
}
console.log("Confirmation email template applied.");
