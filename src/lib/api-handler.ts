import { NextResponse } from "next/server";

// Errors thrown by the session helpers, turned into the matching HTTP status.
const AUTH_ERRORS: Record<string, { status: number; error: string }> = {
  UNAUTHENTICATED: { status: 401, error: "Please sign in again." },
  NO_ALLIANCE: { status: 403, error: "Create or join an alliance first." },
  FORBIDDEN: { status: 403, error: "You don't have permission to do that." }
};

/**
 * Wraps a Route Handler so that any thrown error (most commonly a MongoDB
 * connection failure, or a Gemini API failure) is turned into a proper JSON
 * error response instead of an empty/broken response body that crashes
 * `res.json()` on the client.
 */
export function withErrorHandling<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      const known = err instanceof Error ? AUTH_ERRORS[err.message] : undefined;
      if (known) return NextResponse.json({ error: known.error }, { status: known.status });
      console.error(`[${routeName}] failed:`, err);
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
