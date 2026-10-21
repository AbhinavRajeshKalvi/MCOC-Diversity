"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Plus, Users } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";

// Shown to members who aren't in an alliance yet: create one (and become its
// Leader) or join one with the code the Leader sent.
export default function AllianceSetup({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"join" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "join" | "create") {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "join") await sendJson("/api/alliances/join", "POST", { code });
      else await sendJson("/api/alliances", "POST", { name });
      router.push(kind === "join" ? "/profile" : "/alliance");
      router.refresh();
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-parchment-dim">
        Welcome, <span className="text-parchment">{displayName}</span>. Join your alliance with the code your Leader sent you,
        or create a new alliance.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run("join");
        }}
        className="space-y-3"
      >
        <label className="field-label" htmlFor="code">Alliance code</label>
        <input
          id="code"
          className="field-input stat uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          required
        />
        <button type="submit" disabled={busy !== null || code.length < 4} className="btn-primary w-full">
          {busy === "join" ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
          Join alliance
        </button>
      </form>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-parchment-faint">
        <span className="h-px flex-1 bg-ink-line" /> or <span className="h-px flex-1 bg-ink-line" />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run("create");
        }}
        className="space-y-3"
      >
        <label className="field-label" htmlFor="name">New alliance name</label>
        <input id="name" className="field-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        <button type="submit" disabled={busy !== null || name.trim().length < 2} className="btn-ghost w-full">
          {busy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Create alliance
        </button>
        <p className="text-[11px] text-parchment-faint">You&apos;ll be its Leader and get a code to share with your members.</p>
      </form>
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
      <button onClick={logout} className="flex items-center gap-2 mx-auto text-xs text-parchment-faint hover:text-crimson-bright">
        <LogOut size={13} /> Sign out
      </button>
    </div>
  );
}
