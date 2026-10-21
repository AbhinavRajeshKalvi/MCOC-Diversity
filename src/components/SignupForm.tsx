"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";

export default function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: "", username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await sendJson("/api/auth/signup", "POST", {
        displayName: form.displayName,
        username: form.username,
        email: form.email,
        password: form.password
      });
      router.push("/alliance");
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="displayName">In-game name</label>
        <input id="displayName" className="field-input" value={form.displayName} onChange={set("displayName")} maxLength={60} required autoFocus />
      </div>
      <div>
        <label className="field-label" htmlFor="username">Username</label>
        <input id="username" className="field-input" value={form.username} onChange={set("username")} autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" title="Letters, numbers, dots, dashes or underscores" required />
      </div>
      <div>
        <label className="field-label" htmlFor="email">Email</label>
        <input id="email" type="email" className="field-input" value={form.email} onChange={set("email")} autoComplete="email" required />
        <p className="mt-1 text-[11px] text-parchment-faint">Used only to send you password reset codes.</p>
      </div>
      <div>
        <label className="field-label" htmlFor="password">Password</label>
        <input id="password" type="password" className="field-input" value={form.password} onChange={set("password")} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="field-label" htmlFor="confirm">Confirm password</label>
        <input id="confirm" type="password" className="field-input" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" minLength={8} required />
      </div>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      <button type="submit" disabled={loading} aria-busy={loading} className="btn-primary w-full">
        {loading ? <><Loader2 size={15} className="animate-spin" /> Creating account…</> : "Create account"}
      </button>
    </form>
  );
}
