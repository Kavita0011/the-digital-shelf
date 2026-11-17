export const metadata = { title: "Upload Safety Policy" };
export default function Page() {
  return <div className="container-page max-w-3xl py-16"><h1 className="text-3xl font-bold">Upload Safety Policy</h1><p className="mt-6 whitespace-pre-line text-slate-600">Only PDF, PNG, JPG, WEBP, ZIP, MP4, MP3, DOCX, XLSX and PPTX files are accepted. Executables and scripts are blocked. File type is verified by magic bytes, files are renamed to UUIDs, stored privately, and scanned by VirusTotal before admin review.</p></div>;
}
