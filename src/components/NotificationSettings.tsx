"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { sendJson } from "@/lib/client-fetch";
import { NOTIFICATION_KINDS, type NotificationKind, type NotificationPrefs } from "@/lib/notification-kinds";

// The Notifications section of the Account page. Each kind is a separate
// switch, all off to start. Turning the first one on asks the browser for
// permission and subscribes this device to push.

type Support = "ok" | "ios-install" | "unsupported" | "embed";

function detectSupport(): Support {
  if (document.documentElement.dataset.embed) return "embed";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhones only allow web push for sites added to the home screen.
  if (ios && !standalone) return "ios-install";
  return capable ? "ok" : "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Subscribes this device (if it isn't already) and saves it for the member. */
async function subscribeDevice(publicKey: string): Promise<void> {
  const registration = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
    }));
  await sendJson("/api/push/subscription", "POST", { subscription: subscription.toJSON() });
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [serverEnabled, setServerEnabled] = useState(true);
  const [support, setSupport] = useState<Support | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unknown">("unknown");
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState<NotificationKind | "device" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detected = detectSupport();
    setSupport(detected);
    if ("Notification" in window) setPermission(Notification.permission);
    if (detected === "ok") void currentSubscription().then((sub) => setDeviceOn(Boolean(sub))).catch(() => undefined);
    fetch("/api/push")
      .then((res) => res.json())
      .then((data) => {
        setPrefs(data.prefs);
        setPublicKey(data.publicKey ?? null);
        setServerEnabled(Boolean(data.enabled));
      })
      .catch(() => setError("Couldn't load your notification settings."));
  }, []);

  /**
   * Gets permission and a subscription for this device. Must start inside the
   * tap itself: iPhones only show the permission prompt for a direct tap.
   */
  async function enableDevice(): Promise<boolean> {
    if (support !== "ok") return false;
    if (!publicKey) {
      setError("Notifications aren't set up on the server yet. Ask your Admin to add the VAPID keys.");
      return false;
    }
    const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    if (result !== "granted") {
      setError(
        result === "denied"
          ? "Notifications are blocked for War Room. Allow them in your phone or browser settings, then try again."
          : "Notifications weren't allowed."
      );
      return false;
    }
    await subscribeDevice(publicKey);
    setDeviceOn(true);
    return true;
  }

  async function toggle(kind: NotificationKind) {
    if (!prefs || busy) return;
    setError(null);
    const on = !prefs[kind];
    setBusy(kind);
    try {
      if (on && !deviceOn && !(await enableDevice())) return;
      const data = await sendJson<{ prefs: NotificationPrefs }>("/api/push", "PATCH", { [kind]: on });
      setPrefs(data.prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that setting.");
    } finally {
      setBusy(null);
    }
  }

  async function turnOnDevice() {
    setError(null);
    setBusy("device");
    try {
      await enableDevice();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn on notifications here.");
    } finally {
      setBusy(null);
    }
  }

  const anyOn = prefs ? Object.values(prefs).some(Boolean) : false;
  const canToggle = support === "ok" && serverEnabled;

  return (
    <section className="panel p-5 space-y-4">
      <h2 className="font-display text-xl tracking-wide text-parchment">Notifications</h2>

      {support === "ios-install" && (
        <p className="rounded-lg border border-brass/40 bg-brass/10 p-3 text-sm text-parchment-dim">
          On iPhone, add War Room to your Home Screen first: tap <span className="text-parchment">Share</span>, then{" "}
          <span className="text-parchment">Add to Home Screen</span>. Open it from there and come back to this page.
        </p>
      )}
      {support === "unsupported" && (
        <p className="text-sm text-parchment-faint">This browser can&apos;t show notifications. Try Chrome, or add War Room to your home screen.</p>
      )}
      {support === "embed" && (
        <p className="text-sm text-parchment-faint">Open War Room in your phone&apos;s browser to set up notifications.</p>
      )}
      {support === "ok" && !serverEnabled && (
        <p className="text-sm text-parchment-faint">Notifications aren&apos;t set up on the server yet.</p>
      )}

      {prefs === null ? (
        !error && (
          <p className="flex items-center gap-2 text-sm text-parchment-faint">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )
      ) : (
        <ul className="divide-y divide-ink-line/70">
          {NOTIFICATION_KINDS.map(({ kind, label, description }) => {
            const on = prefs[kind];
            return (
              <li key={kind} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-parchment">{label}</div>
                  <div className="text-xs text-parchment-faint">{description}</div>
                </div>
                {busy === kind && <Loader2 size={14} className="animate-spin text-brass-bright shrink-0" aria-hidden />}
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={label}
                  disabled={!canToggle || busy !== null}
                  onClick={() => toggle(kind)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
                    on ? "border-teal bg-teal" : "border-ink-lighter bg-ink-raised"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-parchment shadow transition-all ${
                      on ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {canToggle && anyOn && !deviceOn && permission !== "denied" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-line/70 bg-ink/40 p-3">
          <p className="min-w-0 flex-1 text-xs text-parchment-dim">These are on for your account, but this device isn&apos;t set up to receive them.</p>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy !== null} onClick={turnOnDevice}>
            Turn on for this device
          </button>
        </div>
      )}
      {error && <p className="text-sm text-crimson-bright">{error}</p>}
    </section>
  );
}
