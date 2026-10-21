import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by the auth provider whenever the stored token changes. */
export function setApiToken(token: string | null) {
  currentToken = token;
}

/** The current login token, for requests `api()` can't make (the live chat stream). */
export function getApiToken(): string | null {
  return currentToken;
}

/** Called when the server says the session is no longer valid (signed out elsewhere, password changed, account deleted). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/**
 * Calls the War Room API. Sends the login token as a Bearer header and
 * `X-Client: mobile`, so sign-in responses include the token. Throws ApiError
 * with the server's message on failure.
 */
export async function api<T = any>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Client": "mobile", Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (currentToken && init.auth !== false) headers.Authorization = `Bearer ${currentToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "omit"
    });
  } catch {
    throw new ApiError("Couldn't reach the War Room server. Check your connection and try again.", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && currentToken && init.auth !== false) onUnauthorized?.();
    const fallback =
      res.status >= 500
        ? "The server had a problem. Try again in a moment."
        : res.status === 429
          ? "Too many tries. Wait a few minutes and try again."
          : "Something went wrong.";
    throw new ApiError((data as { error?: string }).error ?? fallback, res.status);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
