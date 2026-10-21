"use client";

import { useEffect, useRef, useState } from "react";
import { GripVertical, Loader2, Search, Swords, X } from "lucide-react";
import SlidingTabs from "./SlidingTabs";
import { getChampionArt } from "@/lib/champion-art";
import { BIG_THINGS_NODE_INFO } from "@/lib/big-things-nodes";
import {
  ATTACKERS_PER_NODE,
  MAP_LAYOUTS,
  NODE_RADIUS,
  type AttackBoard,
  type AttackerChampion,
  type AttackMember,
  type AttackSlot
} from "@/lib/attack-map";

// The Big Things attack map. Members drag their own name from the list onto a
// node, officers can drag anyone, and dragging a name off its node and letting
// go anywhere that isn't a node clears it. Tapping a node opens its details,
// where the holder (or an officer) picks two attackers from their roster.

// Theme colors (tailwind.config.ts), needed as raw values inside the SVG.
const C = {
  ink: "#0D0F14",
  raised: "#20232C",
  lighter: "#474C5C",
  parchment: "#EEF0F7",
  brass: "#E0A93B",
  brassBright: "#F6C861",
  teal: "#2FA88A",
  tealBright: "#4FD1A9",
  crimson: "#C2364E",
  crimsonBright: "#F05A72"
};

// How long a finger rests on a name before it can be dragged, so a normal swipe still scrolls.
const TOUCH_HOLD_MS = 300;
// How far a finger can wander during that hold before it counts as a scroll.
const TOUCH_SLOP_PX = 10;
// How far the mouse moves with the button down before a press becomes a drag.
const MOUSE_DRAG_PX = 4;

const layout = MAP_LAYOUTS.bigThings;

type Drag = {
  member: AttackMember;
  /** The node the name was picked up from, or null when dragged from the list. */
  from: AttackSlot | null;
  x: number;
  y: number;
  touch: boolean;
  /** The node under the pointer, if any. */
  over: AttackSlot | null;
};

function shortName(name: string, max = 10): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function nodeNumber(slot: AttackSlot): number {
  return Number(slot.slice(5));
}

/** The node under a screen point. The drag ghost ignores the pointer, so it never gets in the way. */
function slotAt(x: number, y: number): AttackSlot | null {
  const slot = document.elementFromPoint(x, y)?.closest("[data-attack-slot]")?.getAttribute("data-attack-slot");
  return (slot as AttackSlot | undefined) ?? null;
}

/**
 * The board after putting a member on a node, mirroring the server so the map
 * updates before the save comes back: the member leaves their old node, and if
 * an officer dropped them on someone else, that person takes the old node.
 */
function moveLocally(board: AttackBoard, slot: AttackSlot, member: AttackMember, swap: boolean): AttackBoard {
  const assignments = { ...board.assignments };
  const attackers = { ...board.attackers };
  const previous = (Object.keys(assignments) as AttackSlot[]).find((s) => assignments[s]?.userId === member.userId);
  const occupant = assignments[slot];
  if (previous) {
    delete assignments[previous];
    delete attackers[previous];
  }
  assignments[slot] = member;
  delete attackers[slot];
  if (swap && occupant && previous) assignments[previous] = occupant;
  return { ...board, assignments, attackers };
}

function clearLocally(board: AttackBoard, slot: AttackSlot): AttackBoard {
  const assignments = { ...board.assignments };
  const attackers = { ...board.attackers };
  delete assignments[slot];
  delete attackers[slot];
  return { ...board, assignments, attackers };
}

export default function BigThingsAttackMap({
  boards: initialBoards,
  viewerId,
  isOfficer,
  initialBattlegroup
}: {
  boards: AttackBoard[];
  viewerId: string;
  isOfficer: boolean;
  initialBattlegroup: number;
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [active, setActive] = useState(() =>
    Math.max(0, initialBoards.findIndex((board) => board.battlegroup === initialBattlegroup))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [openSlot, setOpenSlot] = useState<AttackSlot | null>(null);
  // The node that just got a player, so its pop animation plays once.
  const [landed, setLanded] = useState<{ slot: AttackSlot; id: number } | null>(null);

  const dragRef = useRef<Drag | null>(null);
  const endGesture = useRef<(() => void) | null>(null);
  // Set for the click that follows a drop, so dropping on a node doesn't also open it.
  const suppressClick = useRef(false);

  const board = boards[active]!;
  const viewerInBoard = board.members.some((member) => member.userId === viewerId);
  const holderOf = (slot: AttackSlot): AttackMember | undefined => board.assignments[slot];
  const slotOf = (userId: string): AttackSlot | undefined =>
    (Object.keys(board.assignments) as AttackSlot[]).find((slot) => board.assignments[slot]?.userId === userId);
  const canMove = (member: AttackMember) => isOfficer || (viewerInBoard && member.userId === viewerId);
  const canDropOn = (slot: AttackSlot, member: AttackMember) => {
    const holder = holderOf(slot);
    return isOfficer || !holder || holder.userId === member.userId;
  };

  useEffect(() => () => endGesture.current?.(), []);

  useEffect(() => {
    if (!landed) return;
    const timeout = window.setTimeout(() => setLanded(null), 900);
    return () => window.clearTimeout(timeout);
  }, [landed]);

  function switchBoard(index: number) {
    endGesture.current?.();
    setActive(index);
    setError(null);
    setOpenSlot(null);
    // Keep the open battlegroup in the URL so a refresh returns to it.
    const url = new URL(window.location.href);
    url.searchParams.set("bg", String(boards[index]!.battlegroup));
    window.history.replaceState(null, "", url);
  }

  function replaceBoard(updated: AttackBoard) {
    setBoards((current) => current.map((b) => (b.battlegroup === updated.battlegroup ? updated : b)));
  }

  async function save(slot: AttackSlot, userId: string | null, optimistic: AttackBoard) {
    const before = board;
    setError(null);
    setSaving(true);
    replaceBoard(optimistic);
    try {
      const res = await fetch("/api/attack-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "bigThings", battlegroup: board.battlegroup, slot, userId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        replaceBoard(before);
        setError(data.error ?? "Couldn't save that move.");
        return;
      }
      replaceBoard(data.board as AttackBoard);
    } catch {
      replaceBoard(before);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function drop({ member, from, over }: Drag) {
    if (over) {
      if (over === from) return;
      if (!canDropOn(over, member)) {
        setError(`Node ${nodeNumber(over)} is taken. Only officers can move other players.`);
        return;
      }
      setLanded({ slot: over, id: Date.now() });
      void save(over, member.userId, moveLocally(board, over, member, isOfficer));
    } else if (from) {
      // Thrown off the map: take them off the node.
      void save(from, null, clearLocally(board, from));
    }
  }

  function updateDrag(next: Drag | null) {
    dragRef.current = next;
    setDrag(next);
  }

  /**
   * Starts watching a press on a name. A mouse drag starts once the pointer
   * moves a few pixels; a touch drag starts after a short hold, and moving
   * before then is left to the browser as a scroll.
   */
  function beginPress(member: AttackMember, from: AttackSlot | null, startX: number, startY: number, touch: boolean) {
    if (saving || !canMove(member)) return;
    endGesture.current?.();
    let dragging = false;
    let lastX = startX;
    let lastY = startY;

    const start = () => {
      dragging = true;
      if (touch) navigator.vibrate?.(12);
      updateDrag({ member, from, x: lastX, y: lastY, touch, over: slotAt(lastX, lastY) });
    };
    const move = (x: number, y: number, preventDefault: () => void) => {
      lastX = x;
      lastY = y;
      if (!dragging) {
        const distance = Math.hypot(x - startX, y - startY);
        if (touch && distance > TOUCH_SLOP_PX) stop();
        else if (!touch && distance > MOUSE_DRAG_PX) start();
        return;
      }
      preventDefault();
      updateDrag({ ...dragRef.current!, x, y, over: slotAt(x, y) });
    };
    const finish = (cancelled: boolean) => {
      const current = dragRef.current;
      stop();
      if (!dragging || !current) return;
      suppressClick.current = true;
      // Long enough to cover the click a phone can send a moment after the touch ends.
      window.setTimeout(() => (suppressClick.current = false), 300);
      if (!cancelled) drop(current);
    };

    const onPointerMove = (event: PointerEvent) => move(event.clientX, event.clientY, () => event.preventDefault());
    const onPointerUp = () => finish(false);
    const onTouchMove = (event: TouchEvent) => {
      const point = event.touches[0];
      // Once dragging, this stops the page scrolling under the finger.
      if (point) move(point.clientX, point.clientY, () => event.preventDefault());
    };
    const onTouchEnd = () => finish(false);
    const onCancel = () => finish(true);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && finish(true);
    const holdTimer = touch ? window.setTimeout(start, TOUCH_HOLD_MS) : undefined;

    function stop() {
      window.clearTimeout(holdTimer);
      if (touch) {
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
        window.removeEventListener("touchcancel", onCancel);
      } else {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onCancel);
      }
      window.removeEventListener("keydown", onKey);
      endGesture.current = null;
      if (dragRef.current) updateDrag(null);
    }

    if (touch) {
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onCancel);
    } else {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onCancel);
    }
    window.addEventListener("keydown", onKey);
    endGesture.current = () => finish(true);
  }

  /** Press handlers for anything that can be picked up: a name in the list or a held node. */
  function pressHandlers(member: AttackMember | undefined, from: AttackSlot | null) {
    if (!member || !canMove(member)) return {};
    return {
      onPointerDown: (event: React.PointerEvent) => {
        if (event.pointerType === "touch" || event.button !== 0) return;
        event.preventDefault();
        beginPress(member, from, event.clientX, event.clientY, false);
      },
      onTouchStart: (event: React.TouchEvent) => {
        const point = event.touches[0];
        if (event.touches.length === 1 && point) beginPress(member, from, point.clientX, point.clientY, true);
      },
      // Long-pressing would otherwise open the browser's menu, mainly in the phone app.
      onContextMenu: (event: React.MouseEvent) => event.preventDefault()
    };
  }

  function openNode(slot: AttackSlot) {
    if (suppressClick.current) return;
    setOpenSlot(slot);
  }

  const sortedMembers = [...board.members].sort((a, b) => {
    // You first, then everyone in name order.
    if (a.userId === viewerId) return -1;
    if (b.userId === viewerId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
  const openHolder = openSlot ? holderOf(openSlot) : undefined;

  return (
    <div>
      <SlidingTabs
        tabs={boards.map((b) => ({ key: b.battlegroup, label: `BG ${b.battlegroup}` }))}
        active={active}
        onSelect={switchBoard}
      />

      <div key={board.battlegroup} className="fx-fade-in">
        {error && <p className="text-sm text-crimson-bright mb-4">{error}</p>}
        {board.members.length === 0 ? (
          <p className="text-sm text-parchment-faint mb-4">
            No members are in Battlegroup {board.battlegroup} yet. Officers can add them on the Battlegroups page.
          </p>
        ) : (
          !isOfficer &&
          !viewerInBoard && (
            <p className="text-sm text-parchment-faint mb-4">
              You&apos;re not in Battlegroup {board.battlegroup}, so this map is view only.
            </p>
          )
        )}

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] gap-6 items-start">
          <div className="panel p-3 sm:p-5">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="w-full max-w-[520px] mx-auto block select-none"
              style={{ WebkitTouchCallout: "none" }}
              role="group"
              aria-label={`Battlegroup ${board.battlegroup} attack map`}
            >
              <defs>
                <filter id="bt-attack-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
              </defs>

              {layout.islands.map((island, i) => (
                <polygon key={i} points={island.points} fill={C.ink} fillOpacity={0.75} />
              ))}

              {layout.endBars.map(([x, y], i) => (
                <line
                  key={`end-${i}`}
                  x1={x}
                  y1={y - 24}
                  x2={x}
                  y2={y + 24}
                  stroke={C.crimsonBright}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              ))}

              {layout.islands.map((island, i) => (
                <g key={i}>
                  {island.edges.map(([[x1, y1], [x2, y2]], j) => (
                    <line
                      key={j}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={C.crimson}
                      strokeOpacity={0.75}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                    />
                  ))}
                  {island.markers.map(([x, y], j) => (
                    <circle key={`m${j}`} cx={x} cy={y} r={5} fill={C.crimsonBright} stroke={C.ink} strokeWidth={2} />
                  ))}
                </g>
              ))}

              {layout.nodes.map((node) => {
                const holder = holderOf(node.slot);
                const mine = holder?.userId === viewerId;
                // While dragging, the name being moved is shown at the pointer instead.
                const liftedHere = drag?.from === node.slot;
                const shownHolder = liftedHere ? undefined : holder;
                const hovered = drag?.over === node.slot && drag.from !== node.slot;
                const allowed = hovered && canDropOn(node.slot, drag!.member);
                const fill = shownHolder ? (mine ? C.teal : C.brass) : C.raised;
                const attackerCount = board.attackers?.[node.slot]?.length ?? 0;
                const pop = landed?.slot === node.slot;
                const label = shownHolder ? shortName(shownHolder.displayName) : null;
                const draggable = holder && canMove(holder);
                return (
                  <g
                    key={node.node}
                    data-attack-slot={node.slot}
                    role="button"
                    tabIndex={0}
                    aria-label={`Node ${node.node}${holder ? `, ${holder.displayName}` : ", open"}`}
                    onClick={() => openNode(node.slot)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openNode(node.slot);
                      }
                    }}
                    className={`outline-none ${draggable ? "cursor-grab" : "cursor-pointer"}`}
                    {...pressHandlers(holder, node.slot)}
                  >
                    {/* A larger invisible circle so names are easy to drop on with a finger. */}
                    <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 18} fill="transparent" />
                    {hovered && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS + 8}
                        fill={allowed ? C.tealBright : C.crimsonBright}
                        opacity={0.55}
                        filter="url(#bt-attack-glow)"
                        className="pointer-events-none"
                      />
                    )}
                    <g key={pop ? landed!.id : "still"} className={pop ? "attack-node-pop" : undefined}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_RADIUS}
                        fill={fill}
                        stroke={hovered ? (allowed ? C.tealBright : C.crimsonBright) : shownHolder ? `${C.brassBright}AA` : C.lighter}
                        strokeWidth={hovered ? 4 : 2}
                        strokeDasharray={liftedHere ? "4 4" : undefined}
                      />
                      <text
                        x={node.x}
                        y={node.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={19}
                        fontWeight={700}
                        fill={shownHolder ? C.ink : C.parchment}
                        className="font-stat pointer-events-none"
                      >
                        {node.node}
                      </text>
                    </g>
                    {label &&
                      (() => {
                        const y = node.y + NODE_RADIUS + 14;
                        const width = label.length * 7.5 + 14;
                        return (
                          <g
                            key={pop ? `label-${landed!.id}` : "label"}
                            className={`pointer-events-none ${pop ? "attack-name-drop" : ""}`}
                          >
                            <rect x={node.x - width / 2} y={y - 10} width={width} height={20} rx={10} fill={C.ink} fillOpacity={0.9} />
                            <text
                              x={node.x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={13}
                              fontWeight={600}
                              fill={mine ? C.tealBright : C.brassBright}
                            >
                              {label}
                            </text>
                            {/* One pip per attacker picked, so you can see at a glance who's ready. */}
                            {Array.from({ length: ATTACKERS_PER_NODE }, (_, i) => (
                              <circle
                                key={i}
                                cx={node.x + (i - (ATTACKERS_PER_NODE - 1) / 2) * 10}
                                cy={y + 17}
                                r={3}
                                fill={i < attackerCount ? (mine ? C.tealBright : C.brassBright) : "transparent"}
                                stroke={mine ? C.tealBright : C.brassBright}
                                strokeOpacity={0.7}
                                strokeWidth={1.2}
                              />
                            ))}
                          </g>
                        );
                      })()}
                  </g>
                );
              })}
            </svg>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-parchment-faint">
              <Legend color={C.teal} label="You" />
              <Legend color={C.brass} label="Taken" />
              <Legend color={C.raised} border={C.lighter} label="Open" />
              <span>Tap a node for its details and attackers.</span>
            </div>
          </div>

          <section className="panel p-4 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-display text-lg font-semibold">Battlegroup {board.battlegroup} players</h2>
              {saving && <Loader2 size={14} className="animate-spin text-brass-bright" aria-label="Saving" />}
            </div>
            <p className="text-xs text-parchment-faint mb-3">
              {isOfficer
                ? "Drag anyone onto a node. Drop someone on a taken node to swap them. Drag a name off its node and let go anywhere else to clear it."
                : viewerInBoard
                  ? "Drag your name onto an open node. Drag it off the node and let go anywhere else to clear it."
                  : "Members of this battlegroup drag their own names onto the map."}
              {(isOfficer || viewerInBoard) && " On a phone, press and hold a name first."}
            </p>
            {sortedMembers.length === 0 ? (
              <p className="text-sm text-parchment-faint">Nobody here yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {sortedMembers.map((member) => {
                  const slot = slotOf(member.userId);
                  const mine = member.userId === viewerId;
                  const movable = canMove(member);
                  const lifted = drag?.member.userId === member.userId;
                  return (
                    <li
                      key={member.userId}
                      {...pressHandlers(member, null)}
                      onClick={() => slot && openNode(slot)}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 select-none transition-opacity ${
                        mine ? "border-teal/50 bg-teal/10" : "border-ink-line/70 bg-ink/40"
                      } ${movable ? "cursor-grab" : ""} ${slot ? "cursor-pointer" : ""} ${lifted ? "opacity-40" : ""}`}
                      style={{ WebkitTouchCallout: "none" }}
                    >
                      {movable ? (
                        <GripVertical size={16} className="shrink-0 text-parchment-faint" aria-hidden />
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${mine ? "text-teal-bright" : "text-parchment"}`}>
                        {member.displayName}
                        {mine && <span className="ml-1 text-xs font-normal text-parchment-faint">(you)</span>}
                      </span>
                      {slot ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brass/50 px-2 py-0.5 text-xs text-brass-bright">
                          Node {nodeNumber(slot)}
                          <span className="text-parchment-faint">
                            · {board.attackers?.[slot]?.length ?? 0}/{ATTACKERS_PER_NODE}
                          </span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-parchment-faint">No node</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] rounded-full border border-brass-bright bg-ink-raised px-3 py-1.5 text-sm font-semibold text-brass-bright shadow-lg shadow-black/50"
          style={{
            left: drag.x,
            top: drag.y,
            // Above a finger so it stays visible, beside a mouse cursor.
            transform: drag.touch ? "translate(-50%, -150%)" : "translate(12px, -50%)"
          }}
        >
          {drag.member.displayName}
        </div>
      )}

      {openSlot && (
        <NodeSheet
          key={openSlot}
          battlegroup={board.battlegroup}
          slot={openSlot}
          holder={openHolder}
          attackers={board.attackers?.[openSlot] ?? []}
          canEdit={Boolean(openHolder && (isOfficer || openHolder.userId === viewerId))}
          viewerId={viewerId}
          onSaved={replaceBoard}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full" style={{ background: color, border: border ? `1.5px solid ${border}` : undefined }} />
      {label}
    </span>
  );
}

function Portrait({ champion, size = 40 }: { champion: AttackerChampion; size?: number }) {
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

function NodeDescription({ node }: { node: number }) {
  const info = BIG_THINGS_NODE_INFO[node];
  if (!info) return null;
  return (
    <section className="space-y-2">
      {info.challenges.map((effect) => (
        <div key={effect.name} className="rounded-lg border border-brass/40 bg-brass/10 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brass-bright">Challenge · {effect.name}</div>
          <p className="mt-1 text-sm text-parchment-dim">{effect.text}</p>
        </div>
      ))}
      {info.effects.map((effect) => (
        <div key={effect.name} className="rounded-lg border border-ink-line/70 bg-ink/40 p-3">
          <div className="text-sm font-semibold text-parchment">{effect.name}</div>
          <p className="mt-1 text-sm text-parchment-dim">{effect.text}</p>
        </div>
      ))}
    </section>
  );
}

function championStats(champion: AttackerChampion): string {
  return [champion.stars ? `${champion.stars}★` : null, champion.rank ? `R${champion.rank}` : null].filter(Boolean).join(" ");
}

/** A node's details: who holds it, its description, and their attackers. */
function NodeSheet({
  battlegroup,
  slot,
  holder,
  attackers,
  canEdit,
  viewerId,
  onSaved,
  onClose
}: {
  battlegroup: number;
  slot: AttackSlot;
  holder: AttackMember | undefined;
  attackers: AttackerChampion[];
  canEdit: boolean;
  viewerId: string;
  onSaved: (board: AttackBoard) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [roster, setRoster] = useState<AttackerChampion[] | null>(null);
  const [picks, setPicks] = useState<string[]>(attackers.map((a) => a.championId));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function startEditing() {
    setEditing(true);
    setPicks(attackers.map((a) => a.championId));
    if (roster) return;
    setError(null);
    try {
      const res = await fetch(`/api/attack-assignments/attackers?battlegroup=${battlegroup}&slot=${slot}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the roster.");
      setRoster(data.roster as AttackerChampion[]);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Couldn't reach the server. Try again.");
    }
  }

  function toggle(championId: string) {
    setPicks((current) =>
      current.includes(championId)
        ? current.filter((id) => id !== championId)
        : current.length < ATTACKERS_PER_NODE
          ? [...current, championId]
          : current
    );
  }

  async function savePicks() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/attack-assignments/attackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battlegroup, slot, championIds: picks })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save the attackers.");
        return;
      }
      onSaved(data.board as AttackBoard);
      setEditing(false);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const mine = holder?.userId === viewerId;
  const byId = new Map((roster ?? []).map((champion) => [champion.championId, champion]));
  const picked = editing
    ? picks.map((id) => byId.get(id) ?? attackers.find((a) => a.championId === id)).filter((c): c is AttackerChampion => Boolean(c))
    : attackers;
  const needle = query.trim().toLowerCase();
  const filtered = (roster ?? []).filter((champion) => !needle || champion.name.toLowerCase().includes(needle));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Node ${nodeNumber(slot)}`}
        className="panel w-full sm:max-w-md max-h-[90vh] flex flex-col rounded-b-none sm:rounded-b-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 border-b border-ink-line/70">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">Node {nodeNumber(slot)}</h2>
            <p className={`text-sm truncate ${holder ? (mine ? "text-teal-bright" : "text-brass-bright") : "text-parchment-faint"}`}>
              {holder ? holder.displayName : "Open. Drag a name here to take it."}
            </p>
          </div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <NodeDescription node={nodeNumber(slot)} />

          {holder && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-parchment-dim">
                  Attackers {picked.length}/{ATTACKERS_PER_NODE}
                </h3>
                {canEdit && !editing && (
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={startEditing}>
                    {attackers.length ? "Change" : "Pick attackers"}
                  </button>
                )}
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {Array.from({ length: ATTACKERS_PER_NODE }, (_, i) => {
                  const champion = picked[i];
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-2 rounded-lg border p-2 min-w-0 ${
                        champion ? "border-brass/50 bg-brass/10" : "border-dashed border-ink-line text-parchment-faint"
                      }`}
                    >
                      {champion ? (
                        <>
                          <Portrait champion={champion} size={36} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-parchment">{champion.name}</div>
                            <div className="text-[11px] text-parchment-faint">{championStats(champion)}</div>
                          </div>
                          {editing && (
                            <button
                              className="shrink-0 p-1 text-parchment-faint hover:text-parchment"
                              onClick={() => toggle(champion.championId)}
                              aria-label={`Remove ${champion.name}`}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <Swords size={16} className="shrink-0" aria-hidden />
                          <span className="text-xs">Attacker {i + 1}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              {error && <p className="mt-3 text-sm text-crimson-bright">{error}</p>}

              {editing && (
                <div className="mt-4">
                  <label className="relative block">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-parchment-faint" aria-hidden />
                    <input
                      className="field-input w-full py-1.5 pl-8 text-sm"
                      placeholder={`Search ${mine ? "your" : `${holder.displayName}'s`} roster`}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-ink-line/70">
                    {roster === null ? (
                      !error && (
                        <p className="flex items-center gap-2 p-3 text-sm text-parchment-faint">
                          <Loader2 size={14} className="animate-spin" /> Loading roster…
                        </p>
                      )
                    ) : filtered.length === 0 ? (
                      <p className="p-3 text-sm text-parchment-faint">
                        {roster.length === 0 ? "This roster is empty. Add champions on the Profile page." : "No champions match."}
                      </p>
                    ) : (
                      <ul>
                        {filtered.map((champion) => {
                          const on = picks.includes(champion.championId);
                          const full = !on && picks.length >= ATTACKERS_PER_NODE;
                          return (
                            <li key={champion.championId}>
                              <button
                                type="button"
                                disabled={full}
                                onClick={() => toggle(champion.championId)}
                                className={`flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors ${
                                  on ? "bg-brass/15" : "hover:bg-ink-raised"
                                } ${full ? "opacity-40" : ""}`}
                              >
                                <Portrait champion={champion} size={30} />
                                <span className="min-w-0 flex-1 truncate text-sm text-parchment">{champion.name}</span>
                                <span className="shrink-0 text-xs text-parchment-faint">{championStats(champion)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                    <button className="btn-primary px-3 py-1.5 text-sm" disabled={busy || roster === null} onClick={savePicks}>
                      {busy ? "Saving…" : "Save attackers"}
                    </button>
                  </div>
                </div>
              )}
              {!canEdit && (
                <p className="mt-2 text-xs text-parchment-faint">Only {holder.displayName} and officers can change these.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
