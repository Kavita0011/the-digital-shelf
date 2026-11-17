import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/site";

export const metadata = { title: "Contact & Support" };
export default function Page() {
  return (
    <div className="container-page max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Contact &amp; Support</h1>
      <p className="mt-6 whitespace-pre-line text-slate-600">
        Email <a className="font-medium text-brand-600 hover:underline" href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a> with your order number and a clear description of the issue. We aim to reply within two business days. For safety reports, use the report button on any product page.
      </p>
    </div>
  );
}
