"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Crosshair, KeyRound, Loader2, LogOut, Menu, Shield, Swords, Users, UserCog, X, type LucideIcon } from "lucide-react";
import { isOfficerRole, type Role } from "@/lib/roles";

type NavSession = {
  displayName: string;
  role: Role;
};

type NavItem = { href: string; label: string; icon: LucideIcon; accent: string };

// Each section gets a champion-class color as its accent.
const NAV_ITEMS: NavItem[] = [
  { href: "/battlegroups", label: "Battlegroups", icon: Users, accent: "#38BDF8" },
  { href: "/attack", label: "Attack", icon: Crosshair, accent: "#FACC15" },
  { href: "/counters", label: "Counters", icon: Swords, accent: "#F87171" },
  { href: "/profile", label: "My Roster", icon: Shield, accent: "#4ADE80" }
];
const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin", icon: UserCog, accent: "#C084FC" };

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
  // Phones get a top bar with a slide-out menu instead of the sidebar.
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setPendingHref(null);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 30_000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  function startNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
    if (newTab) return;
    setMenuOpen(false);
    if (pathname.startsWith(href)) return;
    setPendingHref(href);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = isOfficerRole(session.role) ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
  const pendingLabel = pendingHref
    ? items.find((item) => item.href === pendingHref)?.label ?? (pendingHref === "/account/password" ? "Change password" : "page")
    : null;
  const currentItem = items.find((item) => pathname.startsWith(item.href));
  const initials = session.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

  const sidebar = (
    <>
      <div className="p-5 pr-14 md:pr-5 flex items-center gap-3">
        <div className="brand-mark h-10 w-10 text-xl shrink-0" aria-hidden>
          WR
        </div>
        <div className="min-w-0">
          <div className="font-display text-2xl font-bold uppercase tracking-wider leading-none bg-gradient-to-r from-brass-bright via-brass-bright to-orange-500 bg-clip-text text-transparent">
            War Room
          </div>
          <div className="text-[11px] uppercase tracking-wider text-parchment-faint mt-1">Defender Diversity Planner</div>
        </div>
      </div>
      <div className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-parchment-faint/80">
        Sections
      </div>
      <nav className="px-3 flex flex-col gap-1">
        {items.map((item) => {
          const active = pendingHref ? pendingHref === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => startNavigation(event, item.href)}
              aria-busy={pendingHref === item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "text-parchment bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-parchment-dim hover:text-parchment hover:bg-white/[0.04]"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full"
                  style={{ background: item.accent, boxShadow: `0 0 12px ${item.accent}` }}
                  aria-hidden
                />
              )}
              <span
                className="grid place-items-center h-8 w-8 rounded-md border transition-colors"
                style={{
                  color: item.accent,
                  borderColor: active ? `${item.accent}80` : "rgba(255,255,255,0.06)",
                  background: active ? `${item.accent}1F` : "rgba(255,255,255,0.03)"
                }}
                aria-hidden
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
              {pendingHref === item.href && <Loader2 size={13} className="animate-spin ml-auto" aria-hidden />}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4">
        <div className="rounded-xl border border-ink-line/80 bg-ink/50 p-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-brass/80 to-crimson/80 text-sm font-semibold text-white shadow-[0_0_14px_-2px_rgba(224,169,59,0.5)]">
              {initials || "?"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-parchment truncate">{session.displayName}</div>
              <div className="text-[11px] uppercase tracking-wider text-brass">{session.role}</div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Link
              href="/account/password"
              onClick={(event) => startNavigation(event, "/account/password")}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-parchment-dim hover:text-brass-bright hover:bg-white/[0.04]"
            >
              <KeyRound size={13} aria-hidden />
              Change password
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-crimson-bright hover:bg-crimson/10 text-left"
            >
              <LogOut size={13} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {pendingHref && (
        <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-brass/20" role="progressbar" aria-label="Loading">
          <div className="h-full w-1/3 bg-brass-bright animate-[nav-progress_1.1s_ease-in-out_infinite]" />
        </div>
      )}
      <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 px-4 h-14 border-b border-ink-line/80 bg-ink-panel/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="-ml-1 grid place-items-center h-10 w-10 shrink-0 rounded-lg text-parchment hover:bg-white/[0.06]"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <Menu size={22} />
        </button>
        <div className="brand-mark h-8 w-8 text-base shrink-0" aria-hidden>
          WR
        </div>
        <div className="font-display text-xl font-bold uppercase tracking-wider leading-none whitespace-nowrap bg-gradient-to-r from-brass-bright via-brass-bright to-orange-500 bg-clip-text text-transparent">
          War Room
        </div>
        {currentItem && (
          <div className="ml-auto min-w-0 truncate text-sm font-medium text-parchment-dim">{currentItem.label}</div>
        )}
      </header>
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto flex flex-col border-r border-ink-line/80 bg-gradient-to-b from-ink-raised via-ink-panel to-ink shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 z-10 grid place-items-center h-9 w-9 rounded-lg text-parchment-faint hover:text-parchment hover:bg-white/[0.06]"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <aside className="hidden md:flex w-60 shrink-0 sticky top-0 h-screen flex-col border-r border-ink-line/80 bg-gradient-to-b from-ink-raised/80 via-ink-panel/90 to-ink/95 shadow-[8px_0_30px_-20px_rgba(0,0,0,0.8)]">
        {sidebar}
      </aside>
      <main className="relative flex-1 min-w-0 px-4 py-5 sm:p-5 md:p-8 lg:p-10 max-w-7xl" aria-busy={Boolean(pendingHref)}>
        {pendingHref && (
          <div className="absolute inset-0 z-40 flex items-start justify-center bg-ink/60 backdrop-blur-[2px] pt-24">
            <div className="flex items-center gap-3 panel px-4 py-3 text-sm text-parchment">
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
