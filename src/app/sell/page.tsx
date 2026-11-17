import { RegisterForm } from "@/components/auth-forms";
export const metadata = { title: "Sell on The Digital Shelf" };
export default function SellPage() {
  return (
    <div className="container-page grid gap-10 py-16 lg:grid-cols-2">
      <div>
        <p className="badge bg-brand-600/10 text-brand-700">For creators</p>
        <h1 className="mt-4 text-4xl font-bold">Sell without the guesswork.</h1>
        <p className="mt-4 text-slate-600">Submit your product, we scan it for malware and review it manually before it appears on the shelf. You keep the majority of every sale via Stripe Connect.</p>
        <ul className="mt-6 space-y-2 text-sm text-slate-600">
          <li>✓ Automated malware scanning on every file</li>
          <li>✓ Manual admin approval — no direct publishing</li>
          <li>✓ Secure, expiring download links for buyers</li>
          <li>✓ Transparent earnings and payout history</li>
        </ul>
      </div>
      <div><h2 className="mb-4 text-xl font-semibold">Create a seller account</h2><RegisterForm seller /></div>
    </div>
  );
}
