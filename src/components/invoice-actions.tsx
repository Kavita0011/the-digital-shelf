"use client";

import Link from "next/link";

export function InvoiceActions({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3 print:hidden">
      <Link className="btn-ghost" href={backHref}>{backLabel}</Link>
      <button type="button" className="btn" onClick={() => window.print()}>Print / Save PDF</button>
    </div>
  );
}
