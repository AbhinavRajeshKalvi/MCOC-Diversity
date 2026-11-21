"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, Loader2, Search, X } from "lucide-react";
import { getChampionArt } from "@/lib/champion-art";
import {
  isPathSlot,
  pathNodes,
  type AttackBoard,
  type AttackerChampion,
  type AttackSlot,
  type TakeoverRequest
} from "@/lib/attack-map";

// The sheet that opens when a node on the regular attack map is tapped.
//
// Paths (nodes 1-36) only show who runs them; officers assign them by drag
// and drop. Nodes 37-50 can be booked by anyone in the battlegroup, with an
// optional champion. Tapping someone else's booking lets you ask them for it;
// the holder sees the request (and the champion you'd use) and hands the node
// over or keeps it.

type Props = {
  board: AttackBoard;
  slot: AttackSlot;
  viewerId: string;
  isOfficer: boolean;
  viewerInBoard: boolean;
  onBoard: (board: AttackBoard) => void;
  onClose: () => void;
};

async function post(url: string, body: unknown): Promise<AttackBoard> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data.board as AttackBoard;
}

export function Portrait({ champion, size = 40 }: { champion: Pick<AttackerChampion, "name" | "imageUrl">; size?: number }) {
  if (champion.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={champion.imageUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-md object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const art = getChampionArt(champion.name);
  return (
    <span
      className="shrink-0 rounded-md grid place-items-center font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}
      aria-hidden
    >
      {art.initials}
    </span>
  );
}

export function championStats(champion: AttackerChampion): string {
  return [champion.stars ? `${champion.stars}★` : null, champion.rank ? `R${champion.rank}` : null].filter(Boolean).join(" ");
}

function ChampionTile({ champion, note }: { champion: AttackerChampion; note?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-brass/50 bg-brass/10 p-2">
      <Portrait champion={champion} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-parchment">{champion.name}</div>
        <div className="text-[11px] text-parchment-faint">{note ?? championStats(champion)}</div>
      </div>
    </div>
  );
}

type RosterRow = {
  championId: string;
  championName: string;
  championImageUrl: string | null;
  stars: number | null;
  rank: number | null;
};

// The viewer's roster, loaded once per page.
let rosterCache: Promise<AttackerChampion[]> | null = null;
function loadMyRoster(): Promise<AttackerChampion[]> {
  rosterCache ??= fetch("/api/roster")
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load your roster.");
      return (data.roster as RosterRow[])
        .map((row) => ({
          championId: row.championId,
          name: row.championName,
          imageUrl: row.championImageUrl,
          stars: row.stars,
          rank: row.rank
        }))
        .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || (b.rank ?? 0) - (a.rank ?? 0) || a.name.localeCompare(b.name));
    })
    .catch((err) => {
      rosterCache = null;
      throw err;
    });
  return rosterCache;
}

/** Pick one champion from your own roster, or none. */
function ChampionChoice({ value, onChange }: { value: string | null; onChange: (championId: string | null) => void }) {
  const [roster, setRoster] = useState<AttackerChampion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadMyRoster()
      .then(setRoster)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your roster."));
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = (roster ?? []).filter((champion) => !needle || champion.name.toLowerCase().includes(needle));
  const picked = roster?.find((champion) => champion.championId === value) ?? null;

  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-parchment-dim">
        Champion <span className="normal-case tracking-normal font-normal text-parchment-faint">(optional)</span>
      </div>
      {picked && (
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ChampionTile champion={picked} />
          </div>
          <button type="button" className="btn-ghost p-1.5" onClick={() => onChange(null)} aria-label="No champion">
            <X size={16} />
          </button>
        </div>
      )}
      <label className="relative block">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-parchment-faint" aria-hidden />
        <input
          className="field-input w-full py-1.5 pl-8 text-sm"
          placeholder="Search your roster"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-ink-line/70">
        {error ? (
          <p className="p-3 text-sm text-crimson-bright">{error}</p>
        ) : roster === null ? (
          <p className="flex items-center gap-2 p-3 text-sm text-parchment-faint">
            <Loader2 size={14} className="animate-spin" /> Loading your roster…
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-parchment-faint">
            {roster.length === 0 ? "Your roster is empty. Add champions on My Roster." : "No champions match."}
          </p>
        ) : (
          <ul>
            {filtered.map((champion) => {
              const on = champion.championId === value;
              return (
                <li key={champion.championId}>
                  <button
                    type="button"
                    onClick={() => onChange(on ? null : champion.championId)}
                    className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${
                      on ? "bg-brass/15" : "hover:bg-ink-raised"
                    }`}
                  >
                    <Portrait champion={champion} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm text-parchment">{champion.name}</span>
                    <span className="shrink-0 text-xs text-parchment-faint">{championStats(champion)}</span>
                    {on && <Check size={14} className="shrink-0 text-brass-bright" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A request for the viewer's node, with the buttons to answer it. */
export function IncomingRequest({
  request,
  busy,
  onAnswer
}: {
  request: TakeoverRequest;
  busy: boolean;
  onAnswer: (answer: "accept" | "decline") => void;
}) {
  return (
    <li className="rounded-lg border border-teal/40 bg-teal/10 p-3 space-y-2">
      <div className="text-sm text-parchment">
        <span className="font-semibold text-teal-bright">{request.requester.displayName}</span> asked for node{" "}
        {request.slot.slice(5)}
        {request.champion ? " and would use:" : ". They didn't pick a champion."}
      </div>
      {request.champion && <ChampionTile champion={request.champion} />}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => onAnswer("decline")}>
          Keep it
        </button>
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy} onClick={() => onAnswer("accept")}>
          <ArrowLeftRight size={13} /> Hand it over
        </button>
      </div>
    </li>
  );
}

export async function answerRequest(requestId: string, answer: "accept" | "decline" | "cancel"): Promise<AttackBoard> {
  return post(`/api/attack-assignments/requests/${requestId}`, { answer });
}

export default function AttackNodeSheet({ board, slot, viewerId, isOfficer, viewerInBoard, onBoard, onClose }: Props) {
  const [mode, setMode] = useState<"view" | "book" | "ask" | "champion">("view");
  const [championId, setChampionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isPath = isPathSlot(slot);
  const number = Number(slot.slice(5));
  const holder = board.assignments[slot];
  const champion = board.champions?.[slot] ?? null;
  const mine = holder?.userId === viewerId;
  const requests = (board.requests ?? []).filter((request) => request.slot === slot);
  const myRequest = requests.find((request) => request.requester.userId === viewerId);

  async function run(action: () => Promise<AttackBoard>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      onBoard(await action());
      setMode("view");
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const setSlot = (userId: string | null, champion: string | null = null) =>
    run(() =>
      post("/api/attack-assignments", { mode: "regular", battlegroup: board.battlegroup, slot, userId, championId: champion })
    );

  function startPicking(next: "book" | "ask" | "champion") {
    setChampionId(next === "champion" ? champion?.championId ?? null : null);
    setError(null);
    setMode(next);
  }

  const title = isPath ? `Path ${number}` : `Node ${number}`;
  const holderClass = holder ? (mine ? "text-teal-bright" : "text-brass-bright") : "text-parchment-faint";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel w-full sm:max-w-md max-h-[90vh] flex flex-col rounded-b-none sm:rounded-b-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 border-b border-ink-line/70">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className={`text-sm truncate ${holderClass}`}>
              {holder ? (
                <>
                  {mine ? "Booked by you" : `${isPath ? "Run" : "Booked"} by ${holder.displayName}`}
                </>
              ) : isPath ? (
                "Nobody assigned yet"
              ) : (
                "Open"
              )}
            </p>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {isPath ? (
            <>
              <p className="text-sm text-parchment-dim">Nodes {pathNodes(number).join(" · ")}.</p>
              <p className="text-xs text-parchment-faint">
                {isOfficer
                  ? "Drag a name from the player list onto this path to assign it."
                  : "Paths are assigned by officers."}
              </p>
              {isOfficer && holder && (
                <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => setSlot(null)}>
                  Clear path
                </button>
              )}
            </>
          ) : mode === "view" ? (
            <>
              {champion && (
                <ChampionTile champion={champion} note={["Planned attacker", championStats(champion)].filter(Boolean).join(" · ")} />
              )}
              {holder && !champion && <p className="text-sm text-parchment-faint">No champion picked.</p>}

              {!holder &&
                (viewerInBoard ? (
                  <button className="btn-primary w-full justify-center" onClick={() => startPicking("book")}>
                    Book node {number}
                  </button>
                ) : (
                  <p className="text-sm text-parchment-faint">
                    {isOfficer
                      ? "Drag a name from the player list onto this node to put them here."
                      : `Members of Battlegroup ${board.battlegroup} book these nodes.`}
                  </p>
                ))}

              {mine && (
                <>
                  {requests.length > 0 && (
                    <section>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-parchment-dim">
                        Requests for this node
                      </h3>
                      <ul className="space-y-2">
                        {requests.map((request) => (
                          <IncomingRequest
                            key={request.id}
                            request={request}
                            busy={busy}
                            onAnswer={(answer) => run(() => answerRequest(request.id, answer))}
                          />
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => startPicking("champion")}>
                      {champion ? "Change champion" : "Add a champion"}
                    </button>
                    <button className="btn-danger px-3 py-1.5 text-sm" disabled={busy} onClick={() => setSlot(null)}>
                      Give up node
                    </button>
                  </div>
                </>
              )}

              {holder && !mine && viewerInBoard &&
                (myRequest ? (
                  <div className="rounded-lg border border-ink-line/70 bg-ink/40 p-3 space-y-2">
                    <p className="text-sm text-parchment-dim">
                      You asked {holder.displayName} for this node
                      {myRequest.champion ? ` (you'd use ${myRequest.champion.name})` : ""}. Waiting for their answer.
                    </p>
                    <div className="flex justify-end">
                      <button
                        className="btn-ghost px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={() => run(() => answerRequest(myRequest.id, "cancel"))}
                      >
                        Withdraw request
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-primary w-full justify-center" onClick={() => startPicking("ask")}>
                    <ArrowLeftRight size={15} /> Ask for this node
                  </button>
                ))}

              {holder && !mine && isOfficer && (
                <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => setSlot(null)}>
                  Remove booking
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-parchment-dim">
                {mode === "book"
                  ? `Book node ${number} for yourself. Add the champion you'll use if you know it.`
                  : mode === "ask"
                    ? `Ask ${holder?.displayName ?? "them"} to hand node ${number} over. They'll see the champion you'd use and can hand it over or keep it.`
                    : "Which champion will you use here?"}
              </p>
              <ChampionChoice value={championId} onChange={setChampionId} />
              <div className="flex justify-end gap-2">
                <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => setMode("view")}>
                  Cancel
                </button>
                <button
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={busy}
                  onClick={() =>
                    mode === "ask"
                      ? run(() => post("/api/attack-assignments/requests", { battlegroup: board.battlegroup, slot, championId }))
                      : setSlot(viewerId, championId)
                  }
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {mode === "book" ? "Book node" : mode === "ask" ? "Send request" : "Save"}
                </button>
              </div>
            </>
          )}

          {error && <p className="text-sm text-crimson-bright">{error}</p>}
        </div>
      </div>
    </div>
  );
}
