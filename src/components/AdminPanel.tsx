"use client";

import { useMemo, useState } from "react";
import { Crown, Link2, Plus, Search, Trash2 } from "lucide-react";
import ChampionCard from "./ChampionCard";

type Role = "leader" | "officer" | "member";

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
      <ChampionsSection initialChampions={initialChampions} />
    </div>
  );
}

function MembersSection({ initialUsers, viewer }: { initialUsers: User[]; viewer: Viewer }) {
  const [users, setUsers] = useState(initialUsers);
  const viewerIsLeader = viewer.role === "leader";
  const hasLeader = users.some((u) => u.role === "leader");

  // Mirrors the server rules: one Leader, who can't be demoted or removed;
  // only the Leader can demote/remove officers, reset their passwords, or
  // hand over leadership (any officer may appoint one while there is none).
  const canChangeRole = (u: User) =>
    u.role !== "leader" && (u.role !== "officer" || viewerIsLeader || u.id === viewer.userId);
  const canAppointLeader = viewerIsLeader || !hasLeader;
  const canManageAccount = (u: User) => u.role === "member" || viewerIsLeader;

  async function changeRole(u: User, role: Role) {
    if (role === "leader") {
      const message = viewerIsLeader
        ? `Make ${u.displayName} the Leader?\n\nYou will become an officer. Only the Leader can hand leadership back.`
        : `Make ${u.displayName} the Leader?\n\nOnly one member can be Leader, and only they can remove officers.`;
      if (!window.confirm(message)) return;
    }
    await patchUser(u.id, { role });
    if (role === "leader" && viewerIsLeader) window.location.reload();
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
      <h2 className="font-display text-2xl tracking-wide text-parchment mb-1">Members</h2>
      <p className="text-sm text-parchment-faint mb-4">
        Assign each member to a battlegroup so their roster feeds into that board's diversity
        suggestions. The Leader has every officer permission and is the only one who can remove officers.
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
                    {u.role === "leader" && <Crown size={13} className="text-brass-bright" aria-label="Leader" />}
                    {u.displayName}
                  </span>
                </td>
                <td className="px-4 py-2.5 stat text-parchment-dim">{u.username}</td>
                <td className="px-4 py-2.5">
                  <select
                    className="field-input py-1 text-xs disabled:opacity-50"
                    value={u.role}
                    disabled={!canChangeRole(u)}
                    title={
                      u.role === "leader"
                        ? "The Leader can't be demoted. They can hand leadership to someone else."
                        : !canChangeRole(u)
                        ? "Only the Leader can change an officer's role."
                        : undefined
                    }
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                  >
                    <option value="member">Member</option>
                    <option value="officer">Officer</option>
                    {(u.role === "leader" || canAppointLeader) && <option value="leader">Leader</option>}
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
                  {canManageAccount(u) && (
                    <button
                      onClick={() => patchUser(u.id, { resetPassword: true })}
                      className="text-xs text-brass hover:text-brass-bright"
                    >
                      Reset password
                    </button>
                  )}
                  {u.role !== "leader" && u.id !== viewer.userId && canManageAccount(u) && (
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
