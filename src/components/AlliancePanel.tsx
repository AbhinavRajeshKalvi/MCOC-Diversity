"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LogOut, RefreshCw } from "lucide-react";
import { isLeaderOrAbove, isOfficerRole, type Role } from "@/lib/roles";
import { sendJson } from "@/lib/client-fetch";

type Alliance = { id: string; name: string; code: string | null; memberCount: number };

export default function AlliancePanel({
  alliance: initial,
  role,
  children
}: {
  alliance: Alliance;
  role: Role;
  /** Shown between the alliance details and the Leave button (the member list). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [alliance, setAlliance] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const leader = isLeaderOrAbove(role);

  async function guard(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const copyCode = () =>
    guard(async () => {
      if (!alliance.code) return;
      await navigator.clipboard.writeText(alliance.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const newCode = () =>
    guard(async () => {
      if (!window.confirm("Make a new alliance code? The old code stops working.")) return;
      const data = await sendJson<{ code: string }>("/api/alliance/code", "POST");
      setAlliance((a) => ({ ...a, code: data.code }));
      setNotice("New code ready. Share it with anyone who still needs to join.");
    });

  const rename = () =>
    guard(async () => {
      const data = await sendJson<{ alliance: Alliance }>("/api/alliance", "PATCH", { name });
      setAlliance(data.alliance);
      setNotice("Alliance renamed.");
    });

  const leave = () =>
    guard(async () => {
      const last = alliance.memberCount <= 1;
      const message = last
        ? `You're the last member. Leaving deletes ${alliance.name} and all its plans. Continue?`
        : `Leave ${alliance.name}? Your roster stays with your account.`;
      if (!window.confirm(message)) return;
      await sendJson("/api/alliance/leave", "POST");
      router.push("/alliance");
      router.refresh();
    });

  return (
    <div className="space-y-6 max-w-xl">
      <section className="panel p-5 space-y-4">
        <div>
          <div className="field-label">Alliance</div>
          {leader ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
              className="flex gap-2"
            >
              <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              <button type="submit" className="btn-ghost" disabled={name.trim() === alliance.name || name.trim().length < 2}>
                Rename
              </button>
            </form>
          ) : (
            <div className="font-display text-2xl tracking-wide text-parchment">{alliance.name}</div>
          )}
          <p className="mt-1 text-xs text-parchment-faint">{alliance.memberCount} member{alliance.memberCount === 1 ? "" : "s"}</p>
        </div>

        {isOfficerRole(role) && alliance.code && (
          <div>
            <div className="field-label">Join code</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="stat text-2xl tracking-[0.3em] text-brass-bright">{alliance.code}</span>
              <button onClick={copyCode} className="btn-ghost py-1.5 text-xs">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
              {leader && (
                <button onClick={newCode} className="btn-ghost py-1.5 text-xs">
                  <RefreshCw size={13} /> New code
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-parchment-faint">
              Send this to new members. They create an account, then join with the code.
            </p>
          </div>
        )}

        {notice && <p className="text-sm text-teal-bright">{notice}</p>}
        {error && <p className="text-sm text-crimson-bright">{error}</p>}
      </section>

      {children}

      <button onClick={leave} className="btn-danger">
        <LogOut size={14} /> Leave alliance
      </button>
    </div>
  );
}
