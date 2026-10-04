"use client";

import { useMemo, useRef, useState } from "react";
import { Crown, Gem, Link2, Plus, Search, Shield, Trash2 } from "lucide-react";
import ChampionCard from "./ChampionCard";
import ChampionPicker from "./ChampionPicker";
import { EditChampionModal } from "./RosterManager";
import { isLeaderOrAbove, type Role } from "@/lib/roles";

type Viewer = { userId: string; role: Role };

type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  battlegroup: 1 | 2 | 3 | null;
  mustChangePassword: boolean;
};

type Champion = { id: string; name: string; imageUrl: string | null };

export default function AdminPanel({
  initialUsers,
  initialChampions,
  viewer
}: {
  initialUsers: User[];
  initialChampions: Champion[];
  viewer: Viewer;
}) {
  return (
    <div className="space-y-10">
      <MembersSection initialUsers={initialUsers} viewer={viewer} />
      <MemberRosterSection users={initialUsers} champions={initialChampions} />
      <ChampionsSection initialChampions={initialChampions} />
    </div>
  );
}

function MembersSection({ initialUsers, viewer }: { initialUsers: User[]; viewer: Viewer }) {
  const [users, setUsers] = useState(initialUsers);
  const viewerIsAdmin = viewer.role === "admin";
  const viewerIsLeaderOrAbove = isLeaderOrAbove(viewer.role);
  const hasLeader = users.some((u) => u.role === "leader");
  const roleCounts = useMemo(() => {
    const counts: Record<Role, number> = { admin: 0, leader: 0, officer: 0, member: 0 };
    for (const u of users) counts[u.role] = (counts[u.role] ?? 0) + 1;
    return counts;
  }, [users]);

  // Mirrors the server rules. One Admin (above everyone) and one Leader.
  // Only the Admin can change the Admin or the Leader; the Leader and Admin
  // can demote/remove officers and reset their passwords; while there's no
  // Admin, the Leader appoints the first one.
  const canChangeRole = (u: User) => {
    if (u.role === "admin") return u.id === viewer.userId;
    if (u.role === "leader") return viewerIsAdmin;
    if (u.role === "officer") return viewerIsLeaderOrAbove || u.id === viewer.userId;
    return true;
  };
  const canAppointAdmin = viewerIsAdmin;
  const canAppointLeader = viewerIsLeaderOrAbove || !hasLeader;
  const canResetPassword = (u: User) => u.role === "member" || (u.role !== "admin" && viewerIsLeaderOrAbove);
  const canRemove = (u: User) =>
    u.id !== viewer.userId &&
    (u.role === "member" || (u.role === "officer" && viewerIsLeaderOrAbove) || (u.role === "leader" && viewerIsAdmin));

  function roleTitle(u: User) {
    if (canChangeRole(u)) return undefined;
    if (u.role === "admin") return "Only the Admin can change their own role.";
    if (u.role === "leader") return "Only the Admin can change the Leader's role. The Leader can hand leadership to someone else.";
    return "Only the Leader or the Admin can change an officer's role.";
  }

  async function changeRole(u: User, role: Role) {
    let message: string | null = null;
    if (role === "admin") {
      message = `Make ${u.displayName} the Admin?\n\nYou will become the Leader, and the current Leader becomes an officer. Only the Admin can pass the role on.`;
    } else if (role === "leader") {
      message = `Make ${u.displayName} the Leader?\n\nThere is only one Leader${hasLeader ? "; the current Leader becomes an officer" : ""}.`;
    }
    if (message && !window.confirm(message)) return;
    await patchUser(u.id, { role });
    // The viewer's own permissions may have changed; reload to reflect them.
    if (role === "admin" || role === "leader" || u.id === viewer.userId) window.location.reload();
  }
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers((await res.json()).users);
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't update that member.");
      return;
    }
    if (data.defaultPassword) {
      setNotice(`Password reset. New default password: ${data.defaultPassword}`);
    }
    await refresh();
  }

  async function removeUser(u: User) {
    if (!window.confirm(`Remove ${u.displayName}? Their roster will be deleted too.`)) return;
    const id = u.id;
    setError(null);
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't remove that member.");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== id));
  }

  async function addUser(form: {
    username: string;
    displayName: string;
    role: "officer" | "member";
    battlegroup: number | null;
  }) {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't add that member.");
      return;
    }
    setNotice(`${form.displayName} added. Default password: ${data.defaultPassword}`);
    await refresh();
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <h2 className="font-display text-2xl tracking-wide text-parchment">Members</h2>
        <span className="stat text-lg text-brass-bright">{users.length}</span>
        <span className="text-xs text-parchment-faint">
          {roleCounts.admin} admin · {roleCounts.leader} leader · {roleCounts.officer} officer
          {roleCounts.officer === 1 ? "" : "s"} · {roleCounts.member} member{roleCounts.member === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-sm text-parchment-faint mb-4">
        Assign each member to a battlegroup so their roster feeds into that board's diversity
        suggestions. The Admin has every permission. The Leader and the Admin are the only ones who can remove officers.
      </p>
      {!hasLeader && (
        <p className="text-sm text-brass bg-brass/10 border border-brass/30 rounded-sm px-3 py-2 mb-3">
          No Leader is set yet. Choose &ldquo;Leader&rdquo; in a member&apos;s Role column to appoint one.
        </p>
      )}
      {notice && (
        <p className="text-sm text-teal-bright bg-teal/10 border border-teal/30 rounded-sm px-3 py-2 mb-3">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-crimson-bright mb-3">{error}</p>}

      <AddMemberForm onAdd={addUser} />

      <div className="panel overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-parchment-faint">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Battlegroup</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-40"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-line/60 last:border-0 hover:bg-ink-raised/40">
                <td className="px-4 py-2.5 text-parchment">
                  <span className="inline-flex items-center gap-1.5">
                    {u.role === "admin" && <Gem size={13} className="text-violet-300" aria-label="Admin" />}
                    {u.role === "leader" && <Crown size={13} className="text-brass-bright" aria-label="Leader" />}
                    {u.role === "officer" && <Shield size={13} className="text-teal-bright" aria-label="Officer" />}
                    {u.displayName}
                  </span>
                </td>
                <td className="px-4 py-2.5 stat text-parchment-dim">{u.username}</td>
                <td className="px-4 py-2.5">
                  <select
                    className="field-input py-1 text-xs disabled:opacity-50"
                    value={u.role}
                    disabled={!canChangeRole(u)}
                    title={roleTitle(u)}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                  >
                    <option value="member">Member</option>
                    <option value="officer">Officer</option>
                    {(u.role === "leader" || canAppointLeader) && <option value="leader">Leader</option>}
                    {(u.role === "admin" || canAppointAdmin) && <option value="admin">Admin</option>}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="field-input py-1 text-xs"
                    value={u.battlegroup ?? ""}
                    onChange={(e) =>
                      patchUser(u.id, {
                        battlegroup: e.target.value ? Number(e.target.value) : null
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    <option value="1">Battlegroup 1</option>
                    <option value="2">Battlegroup 2</option>
                    <option value="3">Battlegroup 3</option>
                  </select>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {u.mustChangePassword ? (
                    <span className="text-brass">default password</span>
                  ) : (
                    <span className="text-parchment-faint">active</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                  {canResetPassword(u) && (
                    <button
                      onClick={() => patchUser(u.id, { resetPassword: true })}
                      className="text-xs text-brass hover:text-brass-bright"
                    >
                      Reset password
                    </button>
                  )}
                  {canRemove(u) && (
                    <button
                      onClick={() => removeUser(u)}
                      className="text-xs text-crimson-bright hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AddMemberForm({
  onAdd
}: {
  onAdd: (form: {
    username: string;
    displayName: string;
    role: "officer" | "member";
    battlegroup: number | null;
  }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"officer" | "member">("member");
  const [battlegroup, setBattlegroup] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onAdd({
      username,
      displayName,
      role,
      battlegroup: battlegroup ? Number(battlegroup) : null
    });
    setSubmitting(false);
    setUsername("");
    setDisplayName("");
    setRole("member");
    setBattlegroup("");
  }

  return (
    <form onSubmit={onSubmit} className="panel p-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="field-label">Display name</label>
          <input
            className="field-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Username</label>
          <input
            className="field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Role</label>
          <select
            className="field-input"
            value={role}
            onChange={(e) => setRole(e.target.value as "officer" | "member")}
          >
            <option value="member">Member</option>
            <option value="officer">Officer</option>
          </select>
        </div>
        <div>
          <label className="field-label">Battlegroup</label>
          <select
            className="field-input"
            value={battlegroup}
            onChange={(e) => setBattlegroup(e.target.value)}
          >
            <option value="">Unassigned</option>
            <option value="1">Battlegroup 1</option>
            <option value="2">Battlegroup 2</option>
            <option value="3">Battlegroup 3</option>
          </select>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary">
          <Plus size={14} />
          {submitting ? "Adding…" : "Add member"}
        </button>
      </div>
    </form>
  );
}

type MemberRosterEntry = {
  id: string;
  championId: string;
  championName: string;
  championImageUrl: string | null;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  rating: number | null;
  awakened: boolean | null;
  ascended: number | null;
};

// Officers, the Leader and the Admin can add champions to any member's roster
// (the admin page is already limited to them; the API checks again).
function MemberRosterSection({ users, champions }: { users: User[]; champions: Champion[] }) {
  const [memberId, setMemberId] = useState("");
  const [roster, setRoster] = useState<MemberRosterEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedRef = useRef("");
  const [editing, setEditing] = useState<MemberRosterEntry | null>(null);

  const member = users.find((u) => u.id === memberId) ?? null;
  const ownedIds = useMemo(() => new Set((roster ?? []).map((entry) => entry.championId)), [roster]);
  const available = useMemo(() => champions.filter((c) => !ownedIds.has(c.id)), [champions, ownedIds]);
  const sortedRoster = useMemo(
    () =>
      [...(roster ?? [])].sort(
        (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.championName.localeCompare(b.championName)
      ),
    [roster]
  );

  async function loadRoster(userId: string) {
    const res = await fetch(`/api/roster?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.roster)) throw new Error(data.error ?? "Couldn't load that roster.");
    return data.roster as MemberRosterEntry[];
  }

  async function selectMember(userId: string) {
    selectedRef.current = userId;
    setEditing(null);
    setMemberId(userId);
    setRoster(null);
    setError(null);
    setNotice(null);
    if (!userId) return;
    setLoading(true);
    try {
      const loaded = await loadRoster(userId);
      // Ignore a slow response for a member who is no longer selected.
      if (selectedRef.current === userId) setRoster(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that roster.");
    } finally {
      setLoading(false);
    }
  }

  async function addChampion(form: {
    championId: string;
    stars: number;
    awakened: boolean;
    ascended: number;
    rating: number;
    rank: number | null;
    sigLevel: number | null;
  }) {
    if (!member) return;
    setError(null);
    setNotice(null);
    const res = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, userId: member.id })
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't add that champion.");
      throw new Error("add failed");
    }
    const name = champions.find((c) => c.id === form.championId)?.name ?? "Champion";
    setNotice(`${name} was added to ${member.displayName}'s roster.`);
    setRoster(await loadRoster(member.id));
  }

  async function updateEntry(
    id: string,
    form: { stars: number; rating: number | null; awakened: boolean; ascended: number; rank: number | null; sigLevel: number | null }
  ) {
    if (!member) return;
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/roster/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't save that change.");
      return;
    }
    const name = roster?.find((entry) => entry.id === id)?.championName ?? "Champion";
    setNotice(`${name} was updated on ${member.displayName}'s roster.`);
    setRoster(await loadRoster(member.id));
  }

  async function removeEntry(id: string) {
    if (!member) return;
    const name = roster?.find((entry) => entry.id === id)?.championName ?? "this champion";
    if (!window.confirm(`Remove ${name} from ${member.displayName}'s roster?`)) return;
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/roster/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't remove that champion.");
      return;
    }
    setNotice(`${name} was removed from ${member.displayName}'s roster.`);
    setRoster((current) => (current ?? []).filter((entry) => entry.id !== id));
  }

  return (
    <section>
      <h2 className="font-display text-2xl tracking-wide text-parchment mb-1">Edit a member&apos;s roster</h2>
      <p className="text-sm text-parchment-faint mb-4">
        Choose a member, then pick a champion to add it to their roster. Click a champion already in their roster to
        change its stars, PI, rank, signature level and awakening, or to remove it.
      </p>

      <div className="panel p-5 space-y-4">
        <div className="max-w-sm">
          <label className="field-label">Member</label>
          <select className="field-input" value={memberId} onChange={(e) => selectMember(e.target.value)}>
            <option value="">Select a member…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} (@{u.username})
              </option>
            ))}
          </select>
        </div>

        {notice && (
          <p className="text-sm text-teal-bright bg-teal/10 border border-teal/30 rounded-sm px-3 py-2">{notice}</p>
        )}
        {error && <p className="text-sm text-crimson-bright">{error}</p>}

        {member && loading && <p className="text-sm text-parchment-faint">Loading {member.displayName}&apos;s roster…</p>}

        {member && roster && (
          <>
            <ChampionPicker champions={available} onAdd={addChampion} />

            <div>
              <h3 className="font-display text-lg tracking-wide text-parchment mb-3">
                {member.displayName}&apos;s roster <span className="text-parchment-faint text-base">({roster.length})</span>
              </h3>
              {roster.length === 0 ? (
                <p className="text-sm text-parchment-faint">{member.displayName} has no champions yet.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[28rem] overflow-y-auto pr-1">
                  {sortedRoster.map((entry) => (
                    <ChampionCard
                      key={entry.id}
                      name={entry.championName}
                      imageUrl={entry.championImageUrl}
                      size="sm"
                      onClick={() => setEditing(entry)}
                      awakened={entry.awakened}
                      ascended={entry.ascended}
                      stats={entry}
                      details={
                        <div className="stat text-[10px] text-parchment-dim truncate">
                          {entry.rating != null ? `${entry.rating.toLocaleString()} PI` : "PI —"}
                        </div>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {editing && (
        <EditChampionModal
          key={editing.id}
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={updateEntry}
          onRemove={removeEntry}
        />
      )}
    </section>
  );
}

function ChampionsSection({ initialChampions }: { initialChampions: Champion[] }) {
  const [champions, setChampions] = useState(initialChampions);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingImage, setEditingImage] = useState<Champion | null>(null);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return champions
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, filter]);

  async function addChampion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/champions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't add that champion.");
      return;
    }
    setChampions((c) => [...c, data]);
    setName("");
  }

  async function removeChampion(id: string) {
    setError(null);
    const res = await fetch(`/api/champions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't remove that champion.");
      return;
    }
    setChampions((c) => c.filter((x) => x.id !== id));
  }

  async function setImageUrl(id: string, imageUrl: string | null) {
    setError(null);
    const res = await fetch(`/api/champions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl })
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Couldn't update that image.");
      return;
    }
    setChampions((c) => c.map((x) => (x.id === id ? { ...x, imageUrl } : x)));
    setEditingImage(null);
  }

  return (
    <section>
      <h2 className="font-display text-2xl tracking-wide text-parchment mb-1">Champion list</h2>
      <p className="text-sm text-parchment-faint mb-4">
        Kabam adds champions regularly — keep this list current so members can log new pulls.
        Champions without an image get a generated placeholder card; add an image URL to any
        champion if you have one you're licensed to use.
      </p>
      {error && <p className="text-sm text-crimson-bright mb-3">{error}</p>}

      <form onSubmit={addChampion} className="flex flex-wrap gap-3 mb-4">
        <input
          className="field-input max-w-xs"
          placeholder="New champion name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting} className="btn-primary">
          <Plus size={14} />
          Add
        </button>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint" />
          <input
            className="field-input max-w-xs pl-8"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </form>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
        {filtered.map((c) => (
          <ChampionCard
            key={c.id}
            name={c.name}
            imageUrl={c.imageUrl}
            size="sm"
            onClick={() => setEditingImage(c)}
            badge={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeChampion(c.id);
                }}
                className="p-1 rounded-full bg-ink/70 text-parchment-faint hover:text-crimson-bright hover:bg-ink"
                aria-label={`Remove ${c.name}`}
                title="Remove champion"
              >
                <Trash2 size={12} />
              </button>
            }
          />
        ))}
      </div>

      {editingImage && (
        <ImageUrlModal
          champion={editingImage}
          onClose={() => setEditingImage(null)}
          onSave={setImageUrl}
        />
      )}
    </section>
  );
}

function ImageUrlModal({
  champion,
  onClose,
  onSave
}: {
  champion: Champion;
  onClose: () => void;
  onSave: (id: string, imageUrl: string | null) => Promise<void>;
}) {
  const [url, setUrl] = useState(champion.imageUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(champion.id, url.trim() ? url.trim() : null);
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 shrink-0">
            <ChampionCard name={champion.name} imageUrl={url || null} size="sm" />
          </div>
          <h3 className="font-display text-lg tracking-wide text-parchment">{champion.name}</h3>
        </div>
        <label className="field-label">Image URL</label>
        <div className="relative mb-4">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint" />
          <input
            className="field-input pl-8"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
