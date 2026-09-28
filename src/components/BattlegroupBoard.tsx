"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Printer, RefreshCw, Search, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AssignedDefender, BattlegroupBoard, MemberDefenderRow } from "@/lib/diversity";
import ChampionCard from "./ChampionCard";

type BattlegroupMember = {
  userId: string;
  username: string;
  displayName: string;
};

type AllianceUser = BattlegroupMember & {
  battlegroup: 1 | 2 | 3 | null;
};

type BoardView = "suggested" | "current";

export default function BattlegroupBoards({
  boards,
  isOfficer,
  allUsers = [],
  initialBattlegroup,
  initialView = "suggested"
}: {
  boards: BattlegroupBoard[];
  isOfficer?: boolean;
  allUsers?: AllianceUser[];
  initialBattlegroup?: number;
  initialView?: BoardView;
}) {
  const [active, setActive] = useState(() =>
    Math.max(0, boards.findIndex((b) => b.battlegroup === initialBattlegroup))
  );
  const [usersByBoard, setUsersByBoard] = useState<Record<number, AllianceUser[]>>(() =>
    Object.fromEntries(
      boards.map((board) => [
        board.battlegroup,
        board.suggestedDefenders.map((member) => {
          const user = allUsers.find((candidate) => candidate.userId === member.userId);
          return (
            user ?? {
              userId: member.userId,
              username: "",
              displayName: member.displayName,
              battlegroup: board.battlegroup as 1 | 2 | 3
            }
          );
        })
      ])
    )
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState<BoardView>(initialView);
  const [publishing, setPublishing] = useState(false);
  const [autoSuggesting, setAutoSuggesting] = useState(false);
  const [reassigning, setReassigning] = useState<{
    sourceMember: MemberDefenderRow | null;
    champion: AssignedDefender;
  } | null>(null);

  const router = useRouter();
  const board = boards[active];

  // Keep the open Battlegroup and tab in the URL so a page refresh returns to them.
  function rememberLocation(battlegroup: number, nextView: BoardView) {
    const url = new URL(window.location.href);
    url.searchParams.set("bg", String(battlegroup));
    url.searchParams.set("view", nextView);
    window.history.replaceState(window.history.state, "", url);
  }
  const members = usersByBoard[board.battlegroup] ?? [];

  const availableUsers = useMemo(
    () => allUsers.filter((user) => !members.some((member) => member.userId === user.userId)),
    [allUsers, members]
  );

  async function updateBattlegroup(user: AllianceUser, battlegroup: number | null) {
    setError(null);
    setNotice(null);
    setSavingUserId(user.userId);

    try {
      const res = await fetch(`/api/users/${user.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battlegroup })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't update that member.");
        return;
      }

      window.location.reload();
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleRemoveDefender(sourceMember: MemberDefenderRow, champion: AssignedDefender) {
    setError(null);
    setNotice(null);

    const res = await fetch("/api/defender-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "remove",
        battlegroup: board.battlegroup,
        championId: champion.championId,
        fromUserId: sourceMember.userId,
        toUserId: null,
        replaceChampionId: null
      })
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Couldn\'t remove that defender assignment.");
      return;
    }

    setReassigning(null);
    setNotice(`${champion.championName} was removed from the defender plan.`);
    router.refresh();
  }

  async function publishSuggested() {
    if (!isOfficer) return;
    const confirmed = window.confirm(
      `Replace the current Battlegroup ${board.battlegroup} defender list with the suggested list?\n\nThis will overwrite the current snapshot for this Battlegroup.`
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    setPublishing(true);

    try {
      const res = await fetch("/api/current-defender-diversity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish-suggested", battlegroup: board.battlegroup })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't replace the current defender list.");
        return;
      }

      setView("current");
      rememberLocation(board.battlegroup, "current");
      setNotice(
        `Current Battlegroup ${board.battlegroup} defender diversity was replaced with the suggested plan (${data.assigned} defenders).`
      );
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  async function runAutoSuggest() {
    if (!isOfficer) return;
    const confirmed = window.confirm(
      `Rebuild the Battlegroup ${board.battlegroup} suggested plan from the best defenders and highest PI?

This discards any manual changes you made to the suggested plan. The current defender list is not affected.`
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    setAutoSuggesting(true);

    try {
      const res = await fetch("/api/defender-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-suggest", battlegroup: board.battlegroup })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't rebuild the suggested plan.");
        return;
      }

      setReassigning(null);
      setNotice(`Battlegroup ${board.battlegroup} suggested plan was rebuilt (${data.assigned} defenders).`);
      router.refresh();
    } finally {
      setAutoSuggesting(false);
    }
  }

  async function handleReassign(
    sourceMember: MemberDefenderRow | null,
    champion: AssignedDefender,
    targetUserId: string,
    replaceChampionId: string | null
  ) {
    setError(null);
    setNotice(null);

    const res = await fetch("/api/defender-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign",
        battlegroup: board.battlegroup,
        championId: champion.championId,
        fromUserId: sourceMember?.userId ?? null,
        toUserId: targetUserId,
        replaceChampionId
      })
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Couldn't change that defender assignment.");
      return;
    }

    setReassigning(null);
    setNotice(
      sourceMember
        ? `${champion.championName} was reassigned successfully.`
        : `${champion.championName} was added successfully.`
    );
    router.refresh();
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-ink-line">
        {boards.map((b, i) => (
          <button
            key={b.battlegroup}
            onClick={() => {
              setActive(i);
              rememberLocation(b.battlegroup, "suggested");
              setError(null);
              setNotice(null);
              setShowAdd(false);
              setReassigning(null);
              setView("suggested");
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              i === active
                ? "border-brass text-brass-bright"
                : "border-transparent text-parchment-dim hover:text-parchment"
            }`}
          >
            Battlegroup {b.battlegroup}
          </button>
        ))}
      </div>

      {notice && <p className="text-sm text-teal-bright mb-4">{notice}</p>}
      {error && <p className="text-sm text-crimson-bright mb-4">{error}</p>}

      {board.memberCount === 0 ? (
        <div className="panel p-8 text-center text-parchment-faint">
          <p>No members are assigned to Battlegroup {board.battlegroup} yet.</p>
          {isOfficer && availableUsers.length > 0 && (
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4">
              <UserPlus size={15} />
              Add member
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-4 gap-6">
          <div className="md:col-span-3 space-y-6">
            <section className="panel p-5 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 border-b border-ink-line">
                  <button
                    type="button"
                    onClick={() => {
                      setView("suggested");
                      rememberLocation(board.battlegroup, "suggested");
                      setReassigning(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      view === "suggested"
                        ? "border-brass text-brass-bright"
                        : "border-transparent text-parchment-dim hover:text-parchment"
                    }`}
                  >
                    Suggested defender diversity
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView("current");
                      rememberLocation(board.battlegroup, "current");
                      setReassigning(null);
                    }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      view === "current"
                        ? "border-brass text-brass-bright"
                        : "border-transparent text-parchment-dim hover:text-parchment"
                    }`}
                  >
                    Current defender diversity
                  </button>
                </div>

                {view === "suggested" && isOfficer && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={runAutoSuggest}
                      disabled={autoSuggesting}
                      className="btn-ghost"
                      title="Rebuild the suggested plan from the best defenders and highest PI"
                    >
                      <Sparkles size={15} />
                      {autoSuggesting ? "Suggesting…" : "Auto-suggest"}
                    </button>
                    <button
                      type="button"
                      onClick={publishSuggested}
                      disabled={publishing}
                      className="btn-primary"
                      title="Replace the persisted current defender list with this suggested plan"
                    >
                      <RefreshCw size={15} />
                      {publishing ? "Replacing…" : "Replace current with suggested"}
                    </button>
                  </div>
                )}

                {view === "current" && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn-ghost"
                  >
                    <Printer size={15} />
                    Print / Save as PDF
                  </button>
                )}
              </div>
            </section>

            {view === "suggested" ? (
              <>
                <section className="panel p-5">
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                    <div>
                      <h2 className="font-display text-xl tracking-wide text-parchment">Suggested defenders</h2>
                      <p className="text-xs text-parchment-faint mt-1">
                        Up to 5 defenders for each member. Your manual changes stay put; use Auto-suggest to rebuild the
                        plan from the best defenders and highest PI.
                      </p>
                    </div>
                    <div className="flex items-center gap-5 text-right">
                      <div>
                        <div className="stat text-2xl text-brass-bright leading-none">
                          {board.uniqueChampionsAssigned}/{board.maxDefenders}
                        </div>
                        <div className="text-xs text-parchment-faint">defender slots</div>
                      </div>
                      <div>
                        <div className="stat text-2xl text-brass-bright leading-none">{board.priorityAssigned}</div>
                        <div className="text-xs text-parchment-faint">priority</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {board.suggestedDefenders.map((member) => (
                      <MemberDefenderRowView
                        key={member.userId}
                        member={member}
                        isOfficer={isOfficer}
                        onDefenderClick={(champion) => setReassigning({ sourceMember: member, champion })}
                      />
                    ))}
                  </div>
                </section>

                <AdditionalDefendersSection
                  key={`suggested-${board.battlegroup}`}
                  defenders={board.additionalPossibleDefenders}
                  isOfficer={isOfficer}
                  description="Every other available champion, ordered by defensive quality and PI. Officers can click any champion to assign it."
                  onPick={(champion) => setReassigning({ sourceMember: null, champion })}
                />
              </>
            ) : (
              <CurrentDefenderDiversityView board={board} />
            )}
          </div>

          <aside className="space-y-6 print:hidden">
            {isOfficer && (
              <section className="panel p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-display text-xl tracking-wide text-parchment">Battlegroup members</h2>
                    <p className="text-xs text-parchment-faint mt-1">{members.length}/10 members</p>
                  </div>
                  <span className="stat text-sm text-brass-bright">{members.length * 5}/50</span>
                </div>

                <ul className="space-y-2.5">
                  {members.map((member) => {
                    const usage = board.slotUsage.find((slot) => slot.userId === member.userId);
                    const removing = savingUserId === member.userId;
                    return (
                      <li
                        key={member.userId}
                        className="flex items-center gap-2 rounded-sm bg-ink-raised/50 px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-parchment truncate">{member.displayName}</div>
                          <div className="stat text-[11px] text-parchment-faint">{usage?.assigned ?? 0}/5 defenders</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateBattlegroup(member, null)}
                          disabled={removing}
                          className="shrink-0 p-1.5 rounded-sm text-crimson-bright hover:bg-crimson/10 disabled:opacity-40"
                          title={`Remove ${member.displayName} from Battlegroup ${board.battlegroup}`}
                          aria-label={`Remove ${member.displayName} from Battlegroup ${board.battlegroup}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  disabled={members.length >= 10 || availableUsers.length === 0}
                  className="btn-ghost w-full mt-4"
                >
                  <Plus size={15} />
                  {members.length >= 10 ? "Battlegroup full" : "Add member"}
                </button>
              </section>
            )}

            <section className="panel p-5">
              <h2 className="font-display text-xl tracking-wide text-parchment mb-3">Defender plan</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-ink-raised rounded-sm p-3">
                  <div className="stat text-xl text-brass-bright">{board.uniqueChampionsAssigned}</div>
                  <div className="text-xs text-parchment-faint">unique defenders</div>
                </div>
                <div className="bg-ink-raised rounded-sm p-3">
                  <div className="stat text-xl text-brass-bright">{board.mediumAssigned}</div>
                  <div className="text-xs text-parchment-faint">medium used</div>
                </div>
              </div>
              <p className="text-xs text-parchment-faint mt-3">
                {board.priorityAssigned} priority defenders are selected first; medium defenders only fill remaining capacity.
              </p>
            </section>

            <section className="panel p-5">
              <h2 className="font-display text-xl tracking-wide text-parchment mb-3">Estimated diversity score</h2>
              <div className="stat text-3xl text-brass-bright">{board.estimatedDiversityPoints.toLocaleString()}</div>
              <p className="text-xs text-parchment-faint mt-1">
                {board.uniqueChampionsAssigned} unique defenders × {board.pointsPerUniqueDefender} pts. Treat this as a planning estimate, not the official total.
              </p>
            </section>
          </aside>
        </div>
      )}

      {showAdd && isOfficer && (
        <AddMemberModal
          battlegroup={board.battlegroup}
          currentMemberIds={new Set(members.map((member) => member.userId))}
          users={availableUsers}
          savingUserId={savingUserId}
          onClose={() => setShowAdd(false)}
          onAdd={(user) => updateBattlegroup(user, board.battlegroup)}
        />
      )}

      {reassigning && isOfficer && (
        <ReassignDefenderModal
          rows={board.suggestedDefenders}
          sourceMember={reassigning.sourceMember}
          champion={reassigning.champion}
          onClose={() => setReassigning(null)}
          onConfirm={handleReassign}
          onRemove={handleRemoveDefender}
        />
      )}
    </div>
  );
}

function CurrentDefenderDiversityView({ board }: { board: BattlegroupBoard }) {
  return (
    <>
      <section className="panel p-5 print:hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h2 className="font-display text-xl tracking-wide text-parchment">Current defender diversity</h2>
            <p className="text-xs text-parchment-faint mt-1">
              This is the persisted defender list currently in use for Battlegroup {board.battlegroup}. It only changes when an officer replaces it with the suggested plan.
            </p>
          </div>
          <div className="flex items-center gap-5 text-right">
            <div>
              <div className="stat text-2xl text-brass-bright leading-none">
                {board.currentUniqueChampionsAssigned}/{board.maxDefenders}
              </div>
              <div className="text-xs text-parchment-faint">defender slots</div>
            </div>
            <div>
              <div className="stat text-2xl text-brass-bright leading-none">{board.currentPriorityAssigned}</div>
              <div className="text-xs text-parchment-faint">priority</div>
            </div>
          </div>
        </div>

        {board.currentUniqueChampionsAssigned === 0 ? (
          <div className="panel p-8 text-center text-parchment-faint">
            No current defender assignments have been published for this Battlegroup yet.
          </div>
        ) : (
          <div className="space-y-4">
            {board.currentDefenders.map((member) => (
              <MemberDefenderRowView
                key={member.userId}
                member={member}
                isOfficer={false}
                onDefenderClick={() => undefined}
              />
            ))}
          </div>
        )}
      </section>

      <div className="print-only-document">
        <h1 className="print-title">Battlegroup {board.battlegroup} — Current Defender Diversity</h1>
        <p className="print-subtitle">Current persisted defender assignments</p>

        {board.currentDefenders.map((member) => (
          <section key={member.userId} className="print-member">
            <div className="print-member-header">
              <span>{member.displayName}</span>
              <span>{member.assigned}/{member.cap}</span>
            </div>
            {member.defenders.length === 0 ? (
              <div className="print-empty">No defenders assigned</div>
            ) : (
              <div className="print-defenders">
                {member.defenders.map((defender) => (
                  <div key={defender.championId} className="print-defender">
                    <span>{defender.championName}</span>
                    <span>
                      {defender.assignedTo.rating != null ? `${defender.assignedTo.rating.toLocaleString()} PI` : "PI —"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        <div className="print-summary">
          <strong>{board.currentUniqueChampionsAssigned} unique defenders</strong> · {board.currentPriorityAssigned} priority · {board.currentMediumAssigned} medium
        </div>
      </div>
    </>
  );
}

function AdditionalDefendersSection({
  defenders,
  isOfficer,
  description,
  onPick
}: {
  defenders: AssignedDefender[];
  isOfficer?: boolean;
  description: string;
  onPick: (champion: AssignedDefender) => void;
}) {
  const [search, setSearch] = useState("");
  if (defenders.length === 0) return null;

  const query = search.trim().toLowerCase();
  const filtered = query
    ? defenders.filter((c) => `${c.championName} ${c.assignedTo.displayName}`.toLowerCase().includes(query))
    : defenders;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display text-xl tracking-wide text-parchment">Additional Possible Defenders</h2>
          <p className="text-xs text-parchment-faint mt-1">{description}</p>
        </div>
        <span className="stat text-sm text-parchment-faint">{defenders.length}</span>
      </div>

      <div className="relative mt-4 mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint pointer-events-none" />
        <input
          className="field-input pl-9"
          placeholder="Search champions…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-6 text-center text-parchment-faint">
          No champions match “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((c) => (
            <ChampionCard
              key={c.championId}
              name={c.championName}
              imageUrl={c.championImageUrl}
              size="sm"
              onClick={isOfficer ? () => onPick(c) : undefined}
              awakened={c.assignedTo.awakened}
              ascended={c.assignedTo.ascended}
              overlay={defenderOverlay(c, isOfficer, "Click to assign")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MemberDefenderRowView({
  member,
  isOfficer,
  onDefenderClick
}: {
  member: MemberDefenderRow;
  isOfficer?: boolean;
  onDefenderClick: (champion: AssignedDefender) => void;
}) {
  return (
    <div className="rounded-md border border-ink-line bg-ink-raised/30 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-ink-line/70">
        <div className="text-sm font-medium text-parchment truncate">{member.displayName}</div>
        <div className="stat text-xs text-parchment-faint shrink-0">{member.assigned}/{member.cap}</div>
      </div>

      <div className="grid grid-cols-5 gap-2 p-2.5">
        {member.defenders.map((champion) => (
          <ChampionCard
            key={champion.championId}
            name={champion.championName}
            imageUrl={champion.championImageUrl}
            size="sm"
            onClick={isOfficer ? () => onDefenderClick(champion) : undefined}
            awakened={champion.assignedTo.awakened}
            ascended={champion.assignedTo.ascended}
            overlay={defenderOverlay(champion, isOfficer)}
          />
        ))}
        {Array.from({ length: Math.max(0, member.cap - member.assigned) }).map((_, index) => (
          <div
            key={`empty-${index}`}
            className="aspect-[2/3] rounded-lg border border-dashed border-ink-line bg-ink-panel/40 flex items-center justify-center"
            aria-label="Open defender slot"
          >
            <span className="text-xs text-parchment-faint">Open</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function defenderOverlay(c: AssignedDefender, clickable = false, actionLabel = "Click to reassign") {
  return (
    <div className="mt-1">
      <div className="text-brass-bright text-[10px] font-medium truncate">{c.assignedTo.displayName}</div>
      <div className="stat text-[10px] text-parchment-dim">
        {c.assignedTo.rating != null ? `${c.assignedTo.rating.toLocaleString()} PI` : "PI —"}
      </div>
      <div className="stat text-[9px] text-parchment-faint">
        {c.assignedTo.stars != null ? `${c.assignedTo.stars}★` : "★—"}
      </div>
      {clickable && <div className="text-[9px] text-brass-bright/80 mt-0.5">{actionLabel}</div>}
    </div>
  );
}

function ReassignDefenderModal({
  rows,
  sourceMember,
  champion,
  onClose,
  onConfirm,
  onRemove
}: {
  rows: MemberDefenderRow[];
  sourceMember: MemberDefenderRow | null;
  champion: AssignedDefender;
  onClose: () => void;
  onConfirm: (
    sourceMember: MemberDefenderRow | null,
    champion: AssignedDefender,
    targetUserId: string,
    replaceChampionId: string | null
  ) => Promise<void>;
  onRemove: (sourceMember: MemberDefenderRow, champion: AssignedDefender) => Promise<void>;
}) {
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [replaceChampionId, setReplaceChampionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const targetRow = targetUserId
    ? rows.find((member) => member.userId === targetUserId) ?? null
    : null;

  const memberIds = new Set(rows.map((member) => member.userId));
  const owners = champion.owners
    .filter((owner) => memberIds.has(owner.userId))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  function chooseTarget(userId: string) {
    const row = rows.find((member) => member.userId === userId);
    if (!row || userId === sourceMember?.userId) return;
    setTargetUserId(userId);
    setReplaceChampionId(null);
  }

  async function removeAssignment() {
    if (!sourceMember) return;
    setSaving(true);
    try {
      await onRemove(sourceMember, champion);
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    if (!targetUserId) return;
    const target = rows.find((member) => member.userId === targetUserId);
    if (!target) return;
    if (target.assigned >= 5 && !replaceChampionId) return;

    setSaving(true);
    try {
      await onConfirm(sourceMember, champion, targetUserId, replaceChampionId);
    } finally {
      setSaving(false);
    }
  }

  const choosingReplacement = Boolean(targetRow && targetRow.assigned >= 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel w-full max-w-2xl max-h-[90vh] overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="p-5 border-b border-ink-line">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl tracking-wide text-parchment">{sourceMember ? `Reassign ${champion.championName}` : `Assign ${champion.championName}`}</h3>
              <p className="text-xs text-parchment-faint mt-1">
                {sourceMember ? (
                  <>Current defender: <span className="text-parchment">{sourceMember.displayName}</span>. Choose another member who owns this champion.</>
                ) : (
                  <>Choose a Battlegroup member who owns this champion. Available copies are sorted by PI.</>
                )}
              </p>
            </div>
            <button onClick={onClose} className="text-parchment-faint hover:text-parchment" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {!targetUserId ? (
          <>
            <div className="px-5 pt-4 text-xs text-parchment-faint">Available copies, highest PI first</div>
            <div className="max-h-[55vh] overflow-y-auto p-4 space-y-2">
              {owners.length === 0 ? (
                <div className="panel p-6 text-center text-parchment-faint">
                  {sourceMember
                    ? `No other Battlegroup member owns ${champion.championName}.`
                    : `No Battlegroup member owns ${champion.championName}.`}
                </div>
              ) : (
                owners.map((owner) => (
                  <button
                    key={owner.userId}
                    type="button"
                    onClick={() => chooseTarget(owner.userId)}
                    disabled={Boolean(sourceMember && owner.userId === sourceMember.userId)}
                    className="w-full flex items-center gap-3 rounded-md border border-ink-line bg-ink-raised/50 px-3 py-3 text-left hover:border-brass/60 hover:bg-ink-raised transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-parchment truncate">{owner.displayName}</div>
                      <div className="text-xs text-parchment-faint mt-0.5">
                        {owner.rating != null ? `${owner.rating.toLocaleString()} PI` : "PI —"} · {owner.stars ?? "—"}★
                      </div>
                    </div>
                    <div className="text-xs text-brass-bright">{sourceMember && owner.userId === sourceMember.userId ? "Current" : "Select"}</div>
                  </button>
                ))
              )}
            </div>
            {sourceMember && (
              <div className="flex justify-end gap-3 px-5 pb-5">
                <button
                  type="button"
                  onClick={removeAssignment}
                  disabled={saving}
                  className="btn-ghost text-crimson-bright hover:bg-crimson/10"
                >
                  {saving ? "Removing…" : "Remove assignment"}
                </button>
              </div>
            )}
          </>
        ) : choosingReplacement ? (
          <>
            <div className="p-5">
              <div className="rounded-md border border-brass/30 bg-brass/5 p-3 mb-4">
                <div className="text-sm text-parchment">
                  {targetRow?.displayName} already has 5 defenders.
                </div>
                <div className="text-xs text-parchment-faint mt-1">
                  Choose one of their current defenders to replace with {champion.championName}.
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {targetRow?.defenders.map((defender) => (
                  <div key={defender.championId}>
                    <ChampionCard
                      name={defender.championName}
                      imageUrl={defender.championImageUrl}
                      size="sm"
                      awakened={defender.assignedTo.awakened}
                      ascended={defender.assignedTo.ascended}
                      selected={replaceChampionId === defender.championId}
                      onClick={() => setReplaceChampionId(defender.championId)}
                      overlay={
                        <div className="mt-1">
                          <div className="text-brass-bright text-[10px] font-medium truncate">
                            {defender.assignedTo.rating?.toLocaleString() ?? "—"} PI
                          </div>
                        </div>
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 p-4 border-t border-ink-line">
              <button type="button" onClick={() => { setTargetUserId(null); setReplaceChampionId(null); }} className="btn-ghost">
                Back
              </button>
              <button type="button" onClick={confirm} disabled={!replaceChampionId || saving} className="btn-primary">
                <Check size={15} />
                {saving ? "Saving…" : "Confirm replacement"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5">
              <div className="flex items-center gap-3 rounded-md border border-ink-line bg-ink-raised/40 p-3">
                <div className="w-24 sm:w-28 shrink-0">
                  <ChampionCard
                    name={champion.championName}
                    imageUrl={champion.championImageUrl}
                    size="sm"
                    awakened={champion.assignedTo.awakened}
                    ascended={champion.assignedTo.ascended}
                    overlay={<div className="text-[10px] text-brass-bright mt-1">{champion.assignedTo.rating?.toLocaleString() ?? "—"} PI</div>}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-parchment">Move to {targetRow?.displayName}</div>
                  <div className="text-xs text-parchment-faint mt-1">They have {targetRow?.assigned ?? 0}/5 defender slots.</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 border-t border-ink-line">
              <button type="button" onClick={() => setTargetUserId(null)} className="btn-ghost">Back</button>
              <button type="button" onClick={confirm} disabled={saving} className="btn-primary">
                <Check size={15} />
                {saving ? "Saving…" : "Confirm reassignment"}
              </button>
            </div>
          </>
        )}

        <div className="px-5 pb-4 text-[11px] text-parchment-faint">
          This changes the Battlegroup defender assignment only. It does not change either player&apos;s actual MCOC roster.
        </div>
      </div>
    </div>
  );
}

function AddMemberModal({
  battlegroup,
  currentMemberIds,
  users,
  savingUserId,
  onClose,
  onAdd
}: {
  battlegroup: number;
  currentMemberIds: Set<string>;
  users: AllianceUser[];
  savingUserId: string | null;
  onClose: () => void;
  onAdd: (user: AllianceUser) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const filtered = users.filter((user) => {
    if (currentMemberIds.has(user.userId)) return false;
    const value = `${user.displayName} ${user.username}`.toLowerCase();
    return value.includes(query.trim().toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel w-full max-w-md overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="p-5 border-b border-ink-line">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl tracking-wide text-parchment">Add member</h3>
              <p className="text-xs text-parchment-faint mt-1">Select an alliance member for Battlegroup {battlegroup}.</p>
            </div>
            <button onClick={onClose} className="text-parchment-faint hover:text-parchment" aria-label="Close"><X size={20} /></button>
          </div>
          <input
            className="field-input mt-4"
            placeholder="Search members…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-parchment-faint text-center py-8">No available members found.</p>
          ) : (
            filtered.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => onAdd(user)}
                disabled={savingUserId === user.userId}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm text-left hover:bg-ink-raised disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-parchment truncate">{user.displayName}</span>
                  <span className="block text-xs text-parchment-faint truncate">
                    @{user.username}{user.battlegroup ? ` · currently BG ${user.battlegroup}` : " · unassigned"}
                  </span>
                </span>
                <UserPlus size={15} className="text-brass-bright shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
