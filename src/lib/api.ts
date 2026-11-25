import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";
import { assertCsrf } from "./csrf";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ ok: false, error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const details = error.flatten();
    const firstIssue = [...Object.values(details.fieldErrors).flat(), ...details.formErrors][0];
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: firstIssue ? `Invalid input: ${firstIssue}` : "Invalid input",
          details,
        },
      },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", error);
  return NextResponse.json({ ok: false, error: { code: "internal_error", message: "Internal server error" } }, { status: 500 });
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Wrap route handlers with consistent errors and CSRF enforcement.
 * All mutating requests are protected by default; only explicitly exempted
 * routes (e.g. Stripe webhooks, which carry their own signature) may opt out.
 */
export function route<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  opts: { csrf?: boolean } = {},
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      const req = args[0] as Request | undefined;
      if (opts.csrf !== false && req && MUTATING_METHODS.has(req.method)) {
        // assertCsrf expects a NextRequest but only reads cookies/headers/method.
        assertCsrf(req as import("next/server").NextRequest);
      }
      return await handler(...args);
    } catch (error) {
      return fail(error);
    }
  };
}
