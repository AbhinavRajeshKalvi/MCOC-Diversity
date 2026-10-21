// JSON POST/PATCH/DELETE helper for the web forms: returns the parsed body, or
// throws an Error with the server's message.
export async function sendJson<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Couldn't reach the server. Try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}
