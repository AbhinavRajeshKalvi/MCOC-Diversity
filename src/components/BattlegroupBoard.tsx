"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eraser, Plus, Printer, RefreshCw, Search, Shield, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AssignedDefender, BattlegroupBoard, ChampionEntry, MemberDefenderRow, RosterOwner } from "@/lib/diversity";
import { ascensionLabel } from "@/lib/ascension";
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
    /** Skip straight to assigning this member (used from a member's roster). */
    targetUserId?: string;
  } | null>(null);
  const [rosterMemberId, setRosterMemberId] = useState<string | null>(null);
  // Member whose open defender slot was clicked: shows their roster minus their own defenders.
  const [fillMemberId, setFillMemberId] = useState<string | null>(null);

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

  async function clearMemberDefenders(member: MemberDefenderRow) {
    if (!isOfficer) return;
    const confirmed = window.confirm(
      `Clear all ${member.assigned} of ${member.displayName}'s defenders from the Battlegroup ${board.battlegroup} suggested plan?\n\nTheir roster is not changed.`
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);

    const res = await fetch("/api/defender-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", battlegroup: board.battlegroup, userId: member.userId })
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Couldn't clear that member's defenders.");
      return;
    }

    setReassigning(null);
    setNotice(`${member.displayName}'s defenders were cleared.`);
    router.refresh();
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
              setRosterMemberId(null);
              setFillMemberId(null);
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
                    </div>
                  </div>

                  <div className="space-y-4">
                    {sortByDiversityRating(board.suggestedDefenders).map((member) => (
                      <MemberDefenderRowView
                        key={member.userId}
                        member={member}
                        isOfficer={isOfficer}
                        onDefenderClick={(champion) => setReassigning({ sourceMember: member, champion })}
                        onEmptySlotClick={isOfficer ? () => setFillMemberId(member.userId) : undefined}
                        onClear={isOfficer ? () => clearMemberDefenders(member) : undefined}
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
                          <button
                            type="button"
                            onClick={() => setRosterMemberId(member.userId)}
                            className="block max-w-full text-left text-sm text-parchment truncate hover:text-brass-bright hover:underline"
                            title={`View ${member.displayName}'s roster`}
                          >
                            {member.displayName}
                          </button>
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
                Priority defenders are selected first; medium defenders only fill remaining capacity.
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

      {rosterMemberId && isOfficer && (
        <MemberRosterModal
          board={board}
          member={board.suggestedDefenders.find((row) => row.userId === rosterMemberId) ?? null}
          onClose={() => setRosterMemberId(null)}
          onPick={(sourceMember, champion, targetUserId) => setReassigning({ sourceMember, champion, targetUserId })}
        />
      )}

      {fillMemberId && isOfficer && (
        <MemberRosterModal
          board={board}
          member={board.suggestedDefenders.find((row) => row.userId === fillMemberId) ?? null}
          hideOwnDefenders
          onClose={() => setFillMemberId(null)}
          onPick={(sourceMember, champion, targetUserId) => {
            setFillMemberId(null);
            setReassigning({ sourceMember, champion, targetUserId });
          }}
        />
      )}

      {reassigning && isOfficer && (
        <ReassignDefenderModal
          key={`${reassigning.champion.championId}-${reassigning.targetUserId ?? ""}`}
          initialTargetUserId={reassigning.targetUserId}
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
          </div>
        </div>

        {board.currentUniqueChampionsAssigned === 0 ? (
          <div className="panel p-8 text-center text-parchment-faint">
            No current defender assignments have been published for this Battlegroup yet.
          </div>
        ) : (
          <div className="space-y-4">
            {sortByDiversityRating(board.currentDefenders).map((member) => (
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

      <PrintPortal>
        <div className="print-only-document">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="font-display text-2xl tracking-wide text-parchment">
                Battlegroup {board.battlegroup} · Current Defender Diversity
              </h1>
              <p className="text-xs text-parchment-faint mt-1">
                {board.currentUniqueChampionsAssigned} unique defenders
              </p>
            </div>
            <div className="text-right">
              <div className="stat text-2xl text-brass-bright leading-none">
                {board.currentUniqueChampionsAssigned}/{board.maxDefenders}
              </div>
              <div className="text-xs text-parchment-faint">defender slots</div>
            </div>
          </div>

          <div className="space-y-3">
            {sortByDiversityRating(board.currentDefenders).map((member) => (
              <div key={member.userId} className="print-member">
                <MemberDefenderRowView member={member} onDefenderClick={() => undefined} forPrint />
              </div>
            ))}
          </div>
        </div>
      </PrintPortal>
    </>
  );
}

// The print copy is rendered straight into <body> so print CSS can hide the
// rest of the app with display: none instead of leaving blank pages behind.
function PrintPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
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
  const [visibleCount, setVisibleCount] = useState(ADDITIONAL_PAGE_SIZE);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? defenders.filter((c) => `${c.championName} ${c.assignedTo.displayName}`.toLowerCase().includes(query))
        : defenders,
    [defenders, query]
  );
  if (defenders.length === 0) return null;

  // Rendering every champion at once made long lists stutter on phones, so
  // show them in pages. Search still covers the whole list.
  const shown = filtered.slice(0, visibleCount);
  const remaining = filtered.length - shown.length;

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
          onChange={(event) => {
            setSearch(event.target.value);
            setVisibleCount(ADDITIONAL_PAGE_SIZE);
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-6 text-center text-parchment-faint">
          No champions match “{search}”.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {shown.map((c) => (
            <ChampionCard
              key={c.championId}
              name={c.championName}
              imageUrl={c.championImageUrl}
              size="sm"
              onClick={isOfficer ? () => onPick(c) : undefined}
              awakened={c.assignedTo.awakened}
              ascended={c.assignedTo.ascended}
              stats={c.assignedTo}
              details={defenderDetails(c, isOfficer, "Click to assign")}
            />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-ghost" onClick={() => setVisibleCount((count) => count + ADDITIONAL_PAGE_SIZE)}>
            Show {Math.min(remaining, ADDITIONAL_PAGE_SIZE)} more
          </button>
          <button type="button" className="btn-ghost" onClick={() => setVisibleCount(filtered.length)}>
            Show all ({filtered.length})
          </button>
        </div>
      )}
    </section>
  );
}

const ADDITIONAL_PAGE_SIZE = 24;

// Lets the browser skip layout/paint for rows that are off screen.
const OFFSCREEN_SKIP: React.CSSProperties = { contentVisibility: "auto", containIntrinsicSize: "auto 320px" };

/** A member's diversity rating: the total PI of their defenders in the list. */
function diversityRating(member: MemberDefenderRow) {
  return member.defenders.reduce((total, defender) => total + (defender.assignedTo.rating ?? 0), 0);
}

/** Highest diversity rating first; ties by name. */
function sortByDiversityRating(rows: MemberDefenderRow[]) {
  return [...rows].sort(
    (a, b) => diversityRating(b) - diversityRating(a) || a.displayName.localeCompare(b.displayName)
  );
}

function MemberDefenderRowView({
  member,
  isOfficer,
  onDefenderClick,
  onEmptySlotClick,
  onClear,
  forPrint = false
}: {
  member: MemberDefenderRow;
  isOfficer?: boolean;
  onDefenderClick: (champion: AssignedDefender) => void;
  /** Officers: pick a defender for an open slot. */
  onEmptySlotClick?: () => void;
  /** Officers: remove all of this member's defenders. */
  onClear?: () => void;
  /** Print copy: always laid out (no off-screen skipping), images loaded up front. */
  forPrint?: boolean;
}) {
  return (
    <div
      className="rounded-md border border-ink-line bg-ink-raised/30 overflow-hidden"
      style={forPrint ? undefined : OFFSCREEN_SKIP}
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-ink-line/70">
        <div className="flex min-w-0 items-baseline gap-2">
          <div className="text-sm font-medium text-parchment truncate">{member.displayName}</div>
          <div
            className="stat inline-flex items-center gap-1 text-xs text-brass-bright shrink-0 self-center"
            title="Diversity rating: total PI of these defenders"
          >
            <Shield size={12} fill="currentColor" aria-hidden />
            {diversityRating(member).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="stat text-xs text-parchment-faint">{member.assigned}/{member.cap}</div>
          {onClear && member.assigned > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-crimson-bright hover:bg-crimson/10"
              title={`Clear ${member.displayName}'s defenders`}
            >
              <Eraser size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-2 p-2.5 ${forPrint ? "grid-cols-5" : "grid-cols-3 sm:grid-cols-5"}`}>
        {member.defenders.map((champion) => (
          <ChampionCard
            key={champion.championId}
            name={champion.championName}
            imageUrl={champion.championImageUrl}
            size="sm"
            eager={forPrint}
            onClick={isOfficer ? () => onDefenderClick(champion) : undefined}
            awakened={champion.assignedTo.awakened}
            ascended={champion.assignedTo.ascended}
            stats={champion.assignedTo}
            details={defenderDetails(champion, isOfficer, undefined, false)}
          />
        ))}
        {Array.from({ length: Math.max(0, member.cap - member.assigned) }).map((_, index) =>
          onEmptySlotClick ? (
            <button
              key={`empty-${index}`}
              type="button"
              onClick={onEmptySlotClick}
              className="aspect-[2/3] rounded-lg border border-dashed border-ink-line bg-ink-panel/40 flex flex-col items-center justify-center gap-1 text-parchment-faint hover:border-brass/60 hover:text-brass-bright transition-colors"
              aria-label={`Choose a defender for ${member.displayName}`}
              title={`Choose a defender for ${member.displayName}`}
            >
              <Plus size={16} />
              <span className="text-xs">Open</span>
            </button>
          ) : (
            <div
              key={`empty-${index}`}
              className="aspect-[2/3] rounded-lg border border-dashed border-ink-line bg-ink-panel/40 flex items-center justify-center"
              aria-label="Open defender slot"
            >
              <span className="text-xs text-parchment-faint">Open</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function piText(rating: number | null | undefined) {
  return rating != null ? `${rating.toLocaleString()} PI` : "PI —";
}

// Owner and PI sit under the card; stars/rank/ascension/sig are in the card's stat bar.
// A member's own defender row leaves the owner out, since their name heads the row.
function defenderDetails(c: AssignedDefender, clickable = false, actionLabel = "Click to reassign", showOwner = true) {
  return (
    <>
      {showOwner && (
        <div className="text-brass-bright text-[10px] font-medium truncate" title={c.assignedTo.displayName}>
          {c.assignedTo.displayName}
        </div>
      )}
      <div className="stat text-[10px] text-parchment-dim truncate">{piText(c.assignedTo.rating)}</div>
      {clickable && <div className="text-[9px] text-brass-bright/80 truncate">{actionLabel}</div>}
    </>
  );
}

function ReassignDefenderModal({
  initialTargetUserId,
  rows,
  sourceMember,
  champion,
  onClose,
  onConfirm,
  onRemove
}: {
  initialTargetUserId?: string;
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
  const [targetUserId, setTargetUserId] = useState<string | null>(initialTargetUserId ?? null);
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
  // Show the target member's own copy (PI, awakening, ascension) when moving.
  const targetOwner = targetUserId ? champion.owners.find((owner) => owner.userId === targetUserId) : null;
  const shownOwner = targetOwner ?? champion.assignedTo;

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
                        {owner.rating != null ? `${owner.rating.toLocaleString()} PI` : "PI —"} · {owner.stars ?? "—"}★ · R{owner.rank ?? "—"} · Sig {owner.sigLevel ?? "—"}
                      </div>
                      <OwnerStatus owner={owner} />
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

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                      stats={defender.assignedTo}
                      details={<div className="stat text-[10px] text-brass-bright truncate">{piText(defender.assignedTo.rating)}</div>}
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
                    awakened={shownOwner.awakened}
                    ascended={shownOwner.ascended}
                    stats={shownOwner}
                    details={<div className="stat text-[10px] text-brass-bright truncate">{piText(shownOwner.rating)}</div>}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-parchment">{sourceMember ? "Move to" : "Assign to"} {targetRow?.displayName}</div>
                  <div className="text-xs text-parchment-faint mt-1">They have {targetRow?.assigned ?? 0}/5 defender slots.</div>
                  {targetOwner && <OwnerStatus owner={targetOwner} />}
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

function OwnerStatus({ owner }: { owner: RosterOwner }) {
  const awakenedLabel = owner.awakened === true ? "Awakened" : owner.awakened === false ? "Not awakened" : "Awakening unknown";
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] ${
          owner.awakened ? "border-brass-bright/50 text-brass-bright" : "border-ink-line text-parchment-faint"
        }`}
      >
        {awakenedLabel}
      </span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] ${
          owner.ascended ? "border-violet-300/50 text-violet-200" : "border-ink-line text-parchment-faint"
        }`}
      >
        {ascensionLabel(owner.ascended)}
      </span>
    </div>
  );
}

function MemberRosterModal({
  board,
  member,
  hideOwnDefenders = false,
  onClose,
  onPick
}: {
  board: BattlegroupBoard;
  member: MemberDefenderRow | null;
  /** Leave out champions already in this member's defenders (used to fill an open slot). */
  hideOwnDefenders?: boolean;
  onClose: () => void;
  onPick: (sourceMember: MemberDefenderRow | null, champion: AssignedDefender, targetUserId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const roster = useMemo(() => {
    if (!member) return [];
    // Every champion anyone in the Battlegroup owns is either in the suggested
    // plan or in the additional list, each with its full owner list.
    const assignment = new Map<string, { row: MemberDefenderRow; defender: AssignedDefender }>();
    const champions = new Map<string, ChampionEntry>();
    for (const row of board.suggestedDefenders) {
      for (const defender of row.defenders) {
        assignment.set(defender.championId, { row, defender });
        champions.set(defender.championId, defender);
      }
    }
    for (const champion of board.additionalPossibleDefenders) {
      if (!champions.has(champion.championId)) champions.set(champion.championId, champion);
    }

    return Array.from(champions.values())
      .map((champion) => {
        const owner = champion.owners.find((entry) => entry.userId === member.userId);
        return owner ? { champion, owner, assigned: assignment.get(champion.championId) ?? null } : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .filter((entry) => !hideOwnDefenders || entry.assigned?.row.userId !== member.userId)
      .sort((a, b) => (b.owner.rating ?? -1) - (a.owner.rating ?? -1) || a.champion.championName.localeCompare(b.champion.championName));
  }, [board, member, hideOwnDefenders]);

  if (!member) return null;

  const query = search.trim().toLowerCase();
  const filtered = query ? roster.filter((entry) => entry.champion.championName.toLowerCase().includes(query)) : roster;

  function pick(entry: (typeof roster)[number]) {
    if (!member) return;
    if (entry.assigned?.row.userId === member.userId) return;
    if (entry.assigned) {
      onPick(entry.assigned.row, entry.assigned.defender, member.userId);
      return;
    }
    const additional = board.additionalPossibleDefenders.find((c) => c.championId === entry.champion.championId);
    if (additional) onPick(null, additional, member.userId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="panel w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="p-5 border-b border-ink-line">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl tracking-wide text-parchment">
                {hideOwnDefenders ? `Choose a defender for ${member.displayName}` : `${member.displayName}'s roster`}
              </h3>
              <p className="text-xs text-parchment-faint mt-1">
                {hideOwnDefenders
                  ? `${roster.length} champions not already in their defenders · ${member.assigned}/${member.cap} slots used. A red border means someone else has it equipped; picking it moves it to ${member.displayName}.`
                  : `${roster.length} champions · ${member.assigned}/${member.cap} defenders in the suggested plan. Click a champion to add it to ${member.displayName}'s defenders.`}
              </p>
            </div>
            <button onClick={onClose} className="text-parchment-faint hover:text-parchment" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="relative mt-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint pointer-events-none" />
            <input
              className="field-input pl-9"
              placeholder="Search champions…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div className="panel p-6 text-center text-parchment-faint">
              {roster.length === 0
                ? hideOwnDefenders
                  ? `${member.displayName} has no other champions to add.`
                  : `${member.displayName} hasn't added any champions yet.`
                : `No champions match “${search}”.`}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {filtered.map((entry) => {
                const inOwnPlan = entry.assigned?.row.userId === member.userId;
                return (
                  <ChampionCard
                    key={entry.champion.championId}
                    name={entry.champion.championName}
                    imageUrl={entry.champion.championImageUrl}
                    size="sm"
                    selected={inOwnPlan}
                    taken={!!entry.assigned && !inOwnPlan}
                    onClick={inOwnPlan ? undefined : () => pick(entry)}
                    awakened={entry.owner.awakened}
                    ascended={entry.owner.ascended}
                    stats={entry.owner}
                    details={
                      <>
                        <div className="stat text-[10px] text-parchment-dim truncate">{piText(entry.owner.rating)}</div>
                        <div
                          className={`text-[9px] truncate ${inOwnPlan ? "text-teal-bright" : "text-brass-bright/80"}`}
                          title={entry.assigned && !inOwnPlan ? `Equipped by ${entry.assigned.row.displayName}` : undefined}
                        >
                          {inOwnPlan
                            ? "In their defenders"
                            : entry.assigned
                            ? `Equipped by ${entry.assigned.row.displayName}`
                            : "Click to assign"}
                        </div>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
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
