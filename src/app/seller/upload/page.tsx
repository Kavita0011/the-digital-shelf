import { UploadWizard } from "@/components/upload-wizard";
export const metadata = { title: "Upload product" };
export default function UploadPage() { return <><h1 className="text-2xl font-bold">Upload a product</h1><p className="mt-1 text-sm text-slate-500">Sellers cannot publish directly. Every file is scanned and reviewed by an admin.</p><UploadWizard /></>; }
