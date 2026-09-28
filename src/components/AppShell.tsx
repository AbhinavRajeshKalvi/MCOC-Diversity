"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavSession = {
  displayName: string;
  role: "officer" | "member";
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = session.role === "officer" ? [...NAV_ITEMS, { href: "/admin", label: "Admin" }] : NAV_ITEMS;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-ink-line bg-ink-panel">
        <div className="p-5">
          <div className="font-display text-2xl tracking-wide text-brass-bright leading-none">
            War Room
          </div>
          <div className="text-xs text-parchment-faint mt-1">Defender Diversity Planner</div>
        </div>
        <nav className="px-3 flex md:flex-col gap-1">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-sm text-sm transition-colors ${
                  active
                    ? "bg-ink-raised text-brass-bright"
                    : "text-parchment-dim hover:text-parchment hover:bg-ink-raised/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-5 hidden md:block">
          <div className="text-sm text-parchment">{session.displayName}</div>
          <div className="text-xs text-parchment-faint capitalize mb-3">{session.role}</div>
          <Link href="/account/password" className="text-xs text-brass hover:text-brass-bright block mb-2">
            Change password
          </Link>
          <button onClick={logout} className="text-xs text-crimson-bright hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-5 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
