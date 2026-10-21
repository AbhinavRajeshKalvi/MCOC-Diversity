"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";

// Step 1 asks for the account's email and sends a code; step 2 takes the code
// and a new password, then signs the member in.
export default function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await sendJson<{ message: string }>("/api/auth/forgot-password", "POST", { email });
      setMessage(data.message);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const data = await sendJson<{ user: { allianceId: string | null } }>("/api/auth/reset-password", "POST", {
        email,
        code,
        newPassword: password
      });
      router.push(data.user.allianceId ? "/battlegroups" : "/alliance");
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} className="space-y-4">
        <p className="text-sm text-parchment-dim">Enter the email on your account and we&apos;ll send you a 6-digit reset code.</p>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        </div>
        {error && <p className="text-sm text-crimson-bright">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="space-y-4">
      {message && <p className="text-sm text-teal-bright bg-ink-raised border border-ink-line rounded-sm p-3">{message}</p>}
      <div>
        <label className="field-label" htmlFor="code">Code</label>
        <input id="code" inputMode="numeric" className="field-input stat tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" required autoFocus />
      </div>
      <div>
        <label className="field-label" htmlFor="password">New password</label>
        <input id="password" type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="field-label" htmlFor="confirm">Confirm new password</label>
        <input id="confirm" type="password" className="field-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
      </div>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Set new password"}
      </button>
      <button type="button" onClick={() => setStep("email")} className="w-full text-xs text-parchment-faint hover:text-brass-bright">
        Didn&apos;t get it? Send another code
      </button>
    </form>
  );
}
