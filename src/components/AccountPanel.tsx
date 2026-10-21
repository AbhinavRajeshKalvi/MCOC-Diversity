"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";

type Account = { username: string; displayName: string; email: string | null; hasPassword: boolean };

export default function AccountPanel({ account }: { account: Account }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(account.displayName);
  const [email, setEmail] = useState(account.email ?? "");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await sendJson("/api/account", "PATCH", { displayName, ...(email ? { email } : {}) });
      setNotice("Saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    setError(null);
    if (!window.confirm("Delete your account and roster for good? This can't be undone.")) return;
    try {
      await sendJson("/api/account", "DELETE", { password });
      router.push("/login?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <form onSubmit={save} className="panel p-5 space-y-4">
        <div>
          <div className="field-label">Username</div>
          <div className="stat text-parchment-dim">@{account.username}</div>
        </div>
        <div>
          <label className="field-label" htmlFor="displayName">In-game name</label>
          <input id="displayName" className="field-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
        </div>
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {!account.email && (
            <p className="mt-1 text-xs text-brass">Add an email so you can reset your password if you forget it.</p>
          )}
        </div>
        {notice && <p className="text-sm text-teal-bright">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={saving}>Save</button>
          <Link href="/account/password" className="btn-ghost">
            <KeyRound size={14} /> {account.hasPassword ? "Change password" : "Set a password"}
          </Link>
        </div>
      </form>

      <section className="panel p-5 space-y-3">
        <h2 className="font-display text-xl tracking-wide text-parchment">Delete account</h2>
        <p className="text-sm text-parchment-faint">
          Deletes your account and your roster. If you&apos;re your alliance&apos;s Leader, make someone else Leader first.
        </p>
        {account.hasPassword && (
          <input type="password" className="field-input" placeholder="Current password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        )}
        <button onClick={deleteAccount} className="btn-danger">
          <Trash2 size={14} /> Delete my account
        </button>
      </section>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
    </div>
  );
}
