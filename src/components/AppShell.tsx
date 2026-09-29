"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isOfficerRole, type Role } from "@/lib/roles";

type NavSession = {
  displayName: string;
  role: Role;
};

const NAV_ITEMS = [
  { href: "/battlegroups", label: "Battlegroups" },
  { href: "/profile", label: "My Roster" }
];

export default function AppShell({
  session,
  children
}: {
  session: NavSession;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Pages are rendered on the server, so switching sections can take a moment
  // on a slow host. Show that the click registered until the new page arrives.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 30_000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  function startNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (newTab || pathname.startsWith(href)) return;
    setPendingHref(href);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = isOfficerRole(session.role) ? [...NAV_ITEMS, { href: "/admin", label: "Admin" }] : NAV_ITEMS;
  const pendingLabel = pendingHref
    ? items.find((item) => item.href === pendingHref)?.label ?? (pendingHref === "/account/password" ? "Change password" : "page")
    : null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {pendingHref && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-brass/20" role="progressbar" aria-label="Loading">
          <div className="h-full w-1/3 bg-brass-bright animate-[nav-progress_1.1s_ease-in-out_infinite]" />
        </div>
      )}
      <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-ink-line bg-ink-panel">
        <div className="p-5">
          <div className="font-display text-2xl tracking-wide text-brass-bright leading-none">
            War Room
          </div>
          <div className="text-xs text-parchment-faint mt-1">Defender Diversity Planner</div>
        </div>
        <nav className="px-3 flex md:flex-col gap-1">
          {items.map((item) => {
            const active = pendingHref ? pendingHref === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => startNavigation(event, item.href)}
                aria-busy={pendingHref === item.href}
                className={`px-3 py-2 rounded-sm text-sm transition-colors ${
                  active
                    ? "bg-ink-raised text-brass-bright"
                    : "text-parchment-dim hover:text-parchment hover:bg-ink-raised/60"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {item.label}
                  {pendingHref === item.href && <Loader2 size={13} className="animate-spin" aria-hidden />}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-5 hidden md:block">
          <div className="text-sm text-parchment">{session.displayName}</div>
          <div className="text-xs text-parchment-faint capitalize mb-3">{session.role}</div>
          <Link
            href="/account/password"
            onClick={(event) => startNavigation(event, "/account/password")}
            className="text-xs text-brass hover:text-brass-bright block mb-2"
          >
            Change password
          </Link>
          <button onClick={logout} className="text-xs text-crimson-bright hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <main className="relative flex-1 p-5 md:p-8 max-w-6xl" aria-busy={Boolean(pendingHref)}>
        {pendingHref && (
          <div className="absolute inset-0 z-40 flex items-start justify-center bg-ink/60 pt-24">
            <div className="flex items-center gap-3 rounded-md border border-ink-line bg-ink-panel px-4 py-3 text-sm text-parchment shadow-lg">
              <Loader2 size={18} className="animate-spin text-brass-bright" aria-hidden />
              Loading {pendingLabel}…
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
