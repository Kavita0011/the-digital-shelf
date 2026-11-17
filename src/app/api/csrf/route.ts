import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, verifyCsrfCookie } from "@/lib/csrf";

export async function GET(req: Request) {
  const raw = req.headers.get("cookie")?.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))?.split("=")[1];
  const token = verifyCsrfCookie(raw ? decodeURIComponent(raw) : undefined);
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, token });
}
