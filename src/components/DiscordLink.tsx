"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Loader2, Unlink } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";

// The Discord section of the Account page. Linking lets the alliance's
// Discord bot book nodes, answer node requests and show war info as you.

type Status = { linked: boolean; discordUsername: string | null };

export default function DiscordLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/discord/link", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load your Discord link.");
      setStatus(data);
      if (data.linked) setCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your Discord link.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  // While a code is showing, check every few seconds whether it was used.
  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => {
      if (new Date(code.expiresAt).getTime() < Date.now()) setCode(null);
      else void refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [code]);

  async function makeCode() {
    setError(null);
    setBusy(true);
    try {
      setCode(await sendJson("/api/discord/link", "POST"));
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setError(null);
    setBusy(true);
    try {
      await sendJson("/api/discord/link", "DELETE");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the code is on screen anyway.
    }
  }

  return (
    <section className="panel p-5 space-y-3">
      <h2 className="font-display text-xl tracking-wide text-parchment">Discord</h2>
      {!status ? (
        <p className="text-sm text-parchment-faint">
          <Loader2 size={14} className="inline animate-spin" /> Loading…
        </p>
      ) : status.linked ? (
        <>
          <p className="text-sm text-parchment-dim">
            Linked to <span className="text-parchment">@{status.discordUsername}</span>. The alliance bot can book nodes and
            answer node requests for you.
          </p>
          <button onClick={unlink} className="btn-ghost" disabled={busy}>
            <Unlink size={14} /> Unlink Discord
          </button>
        </>
      ) : code ? (
        <>
          <p className="text-sm text-parchment-dim">In your alliance&apos;s Discord server, type this command:</p>
          <div className="flex items-center gap-2">
            <code className="stat text-2xl tracking-[0.3em] text-brass">/link {code.code}</code>
            <button onClick={copy} className="btn-ghost" type="button">
              <Copy size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-parchment-faint">The code works once, for 10 minutes.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-parchment-faint">
            Link your Discord account to book nodes, answer node requests and see war info from your alliance&apos;s Discord
            server.
          </p>
          <button onClick={makeCode} className="btn-primary" disabled={busy}>
            <Link2 size={14} /> Link Discord
          </button>
        </>
      )}
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
    </section>
  );
}
