"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    let res: Response;
    let data: { error?: string; mustChangePassword?: boolean; user?: { allianceId: string | null } };
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      data = await res.json();
    } catch {
      setLoading(false);
      setError("Couldn't reach the server. Try again.");
      return;
    }
    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Something went wrong.");
      return;
    }
    // Leave the button in its loading state until the next page takes over.
    router.push(data.mustChangePassword ? "/account/password" : data.user?.allianceId ? "/battlegroups" : "/alliance");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="username">
          Username or email
        </label>
        <input
          id="username"
          className="field-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <Link href="/forgot-password" className="text-[11px] text-brass hover:text-brass-bright">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          className="field-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      <button type="submit" disabled={loading} aria-busy={loading} className="btn-primary w-full">
        {loading ? <><Loader2 size={15} className="animate-spin" /> Signing in…</> : "Sign in"}
      </button>
    </form>
  );
}
