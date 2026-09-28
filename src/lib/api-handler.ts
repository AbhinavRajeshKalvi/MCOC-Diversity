import { NextResponse } from "next/server";

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
      console.error(`[${routeName}] failed:`, err);
      const message = err instanceof Error ? err.message : "Unexpected server error.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
