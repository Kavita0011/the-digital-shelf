import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, HttpError } from "@/lib/auth";
import { formatInvoiceMoney, loadInvoiceForUser, type Invoice } from "@/lib/invoices";
import { SUPPORT_EMAIL } from "@/lib/site";
import { InvoiceActions } from "@/components/invoice-actions";

export const metadata = { title: "Product invoice" };
export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "Not paid yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function detailLink(role: string): { href: string; label: string } {
  if (role === "admin" || role === "super_admin") return { href: "/admin/orders", label: "Back to orders" };
  if (role === "seller") return { href: "/seller/sales", label: "Back to sales" };
  return { href: "/buyer/purchases", label: "Back to purchases" };
}

function Money({ cents, currency }: { cents: number; currency: string }) {
  return <>{formatInvoiceMoney(cents, currency)}</>;
}

function SummaryRow({ label, cents, currency, strong = false }: {
  label: string;
  cents: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "text-base font-bold" : "text-sm text-slate-600"}`}>
      <span>{label}</span>
      <span><Money cents={cents} currency={currency} /></span>
    </div>
  );
}

function InvoiceBody({ invoice, showPayout }: { invoice: Invoice; showPayout: boolean }) {
  const { amounts, currency } = invoice;
  return (
    <article className="invoice-sheet card p-8 sm:p-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">The Digital Shelf</p>
          <h1 className="mt-2 text-4xl font-bold">Invoice</h1>
          <p className="mt-2 text-sm text-slate-600">{invoice.number}</p>
        </div>
        <div className="text-right text-sm">
          <span className="badge bg-slate-100 font-medium capitalize text-slate-700">{invoice.status.replace(/_/g, " ")}</span>
          <p className="mt-3 text-slate-600">Issued {formatDate(invoice.issuedAt)}</p>
          <p className="text-slate-600">Paid {formatDate(invoice.paidAt)}</p>
        </div>
      </header>

      <section className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</h2>
          <p className="mt-2 font-semibold">{invoice.buyer.name}</p>
          <p className="break-all text-sm text-slate-600">{invoice.buyer.email}</p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sold by</h2>
          <p className="mt-2 font-semibold">{invoice.seller.storeName}</p>
          <p className="break-all text-sm text-slate-600">{invoice.seller.email}</p>
          <p className="mt-2 text-sm text-slate-600">
            <a className="text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </section>

      <section className="mt-10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-300 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-3 pr-3">Product</th>
              <th className="py-3 pr-3 text-right">Qty</th>
              <th className="py-3 pr-3 text-right">Unit price</th>
              <th className="py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-4 pr-3">
                <p className="font-semibold">{invoice.product.title}</p>
                {invoice.product.description && <p className="mt-1 text-slate-600">{invoice.product.description}</p>}
                {invoice.product.slug && <p className="mt-1 text-xs text-slate-500">SKU: {invoice.product.slug}</p>}
              </td>
              <td className="py-4 pr-3 text-right">1</td>
              <td className="py-4 pr-3 text-right"><Money cents={invoice.product.unitPrice} currency={currency} /></td>
              <td className="py-4 text-right"><Money cents={amounts.subtotal} currency={currency} /></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-8 grid gap-10 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment record</h2>
          {invoice.payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No payment has been recorded for this order.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {invoice.payments.map((payment, index) => (
                <li key={`${payment.reference ?? index}-${payment.createdAt}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium capitalize">{payment.method.replace(/_/g, " ")} · {payment.status.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-slate-600">
                    <Money cents={payment.amount} currency={payment.currency} />
                    {payment.creditsUsed > 0 && ` (includes ${payment.creditsUsed} credits)`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(payment.createdAt)}</p>
                  {payment.reference && <p className="mt-1 break-all text-xs text-slate-500">Ref: {payment.reference}</p>}
                  {payment.receiptUrl && <Link className="text-xs text-brand-600 hover:underline" href={payment.receiptUrl}>Payment receipt</Link>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h2>
          <div className="mt-3 rounded-lg bg-slate-50 p-4">
            <SummaryRow label="Subtotal" cents={amounts.subtotal} currency={currency} />
            <SummaryRow label="Discount" cents={-amounts.discount} currency={currency} />
            <SummaryRow label="Credits applied" cents={-amounts.creditsUsed} currency={currency} />
            <SummaryRow label="Card charged" cents={amounts.cardAmount} currency={currency} />
            <SummaryRow label="Tax" cents={amounts.tax} currency={currency} />
            <div className="mt-2 border-t pt-2">
              <SummaryRow label="Total paid" cents={amounts.totalPaid} currency={currency} strong />
            </div>
          </div>
          {showPayout && (
            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller payout</p>
              <div className="mt-2">
                <SummaryRow label="Platform commission" cents={amounts.commission} currency={currency} />
                <div className="mt-1 border-t pt-1">
                  <SummaryRow label="Seller earnings" cents={amounts.sellerEarnings} currency={currency} strong />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {invoice.refunds.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refunds</h2>
          <ul className="mt-3 divide-y rounded-lg border border-slate-200">
            {invoice.refunds.map((refund) => (
              <li key={refund.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <span className="capitalize">{refund.status} · {refund.reason}</span>
                <span className="font-medium"><Money cents={refund.amount} currency={currency} /></span>
                {refund.reference && <span className="w-full break-all text-xs text-slate-500">Ref: {refund.reference}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-12 border-t pt-6 text-xs text-slate-500">
        <p>Thank you for using The Digital Shelf. This invoice was generated from the order, payment, and refund records for {invoice.number}.</p>
        <p className="mt-1">Questions? Contact <a className="text-brand-600 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </footer>
    </article>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let invoice: Invoice;
  try {
    invoice = await loadInvoiceForUser((await params).orderId, user);
  } catch (error) {
    if (error instanceof HttpError && error.status < 500) notFound();
    throw error;
  }

  const back = detailLink(user.realRole);
  const showPayout = user.realRole === "seller" || user.realRole === "admin" || user.realRole === "super_admin";

  return (
    <div className="container-page max-w-4xl py-10">
      <InvoiceActions backHref={back.href} backLabel={back.label} />
      <InvoiceBody invoice={invoice} showPayout={showPayout} />
    </div>
  );
}
