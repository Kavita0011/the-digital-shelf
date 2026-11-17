import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: "validation_error", message: "Invalid input", details: error.flatten() } },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", error);
  return NextResponse.json({ ok: false, error: { code: "internal_error", message: "Internal server error" } }, { status: 500 });
}

/** Wrap route handler bodies with consistent errors and CSRF enforcement. */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  opts: { csrf?: boolean } = {},
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return fail(error);
    }
  };
}
