"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      router.push("/login?passwordChanged=1");
      router.refresh();
    }, 700);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {forced && (
        <p className="text-sm text-parchment-dim bg-ink-raised border border-ink-line rounded-sm p-3">
          You're using the default password. Set your own before continuing.
        </p>
      )}
      <div>
        <label className="field-label" htmlFor="currentPassword">
          Current password
        </label>
        <input
          id="currentPassword"
          type="password"
          className="field-input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="newPassword">
          New password
        </label>
        <input
          id="newPassword"
          type="password"
          className="field-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          type="password"
          className="field-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      {success && <p className="text-sm text-teal-bright">Password updated. Signing you out…</p>}
      <button type="submit" disabled={loading || success} className="btn-primary w-full">
        {loading ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
