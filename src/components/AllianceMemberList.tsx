import { Crown, Gem, ShieldCheck } from "lucide-react";
import type { AllianceMember } from "@/lib/members";
import type { Role } from "@/lib/roles";

const GROUPS: { key: 1 | 2 | 3 | null; title: string }[] = [
  { key: 1, title: "Battlegroup 1" },
  { key: 2, title: "Battlegroup 2" },
  { key: 3, title: "Battlegroup 3" },
  { key: null, title: "No battlegroup yet" }
];

const ROLE_ORDER: Record<Role, number> = { admin: 0, leader: 1, officer: 2, member: 3 };

// Same colors and icons as the app's role badges.
const ROLE_BADGE: Record<Role, { label: string; color: string; icon: typeof Crown | null }> = {
  admin: { label: "Admin", color: "#C084FC", icon: Gem },
  leader: { label: "Leader", color: "#F6C861", icon: Crown },
  officer: { label: "Officer", color: "#4FD1A9", icon: ShieldCheck },
  member: { label: "Member", color: "#6E7591", icon: null }
};

/** Everyone in the alliance, by battlegroup. Shown to every member; officers manage them on the Admin page. */
export default function AllianceMemberList({ members, viewerId }: { members: AllianceMember[]; viewerId: string }) {
  const sorted = [...members].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName)
  );

  return (
    <section className="pt-2 space-y-5">
      <h2 className="font-display text-2xl font-semibold text-parchment">Members</h2>
      {GROUPS.map((group) => {
        const inGroup = sorted.filter((m) => m.battlegroup === group.key);
        if (inGroup.length === 0) return null;
        return (
          <div key={String(group.key)}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="field-label !mb-0">{group.title}</div>
              <div className="stat text-xs text-parchment-faint">{group.key ? `${inGroup.length}/10` : inGroup.length}</div>
            </div>
            <ul className="panel divide-y divide-ink-line/60 overflow-hidden">
              {inGroup.map((member) => {
                const badge = ROLE_BADGE[member.role];
                const Icon = badge.icon;
                return (
                  <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-parchment">
                        {member.displayName}
                        {member.id === viewerId && <span className="ml-2 text-xs font-normal text-parchment-faint">(you)</span>}
                      </div>
                      <div className="truncate stat text-xs text-parchment-faint">@{member.username}</div>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: badge.color, borderColor: `${badge.color}66`, background: `${badge.color}14` }}
                    >
                      {Icon && <Icon size={11} aria-hidden />}
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
