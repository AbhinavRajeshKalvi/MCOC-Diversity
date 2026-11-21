"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, GripVertical, Loader2 } from "lucide-react";
import SlidingTabs from "./SlidingTabs";
import AttackNodeSheet, { IncomingRequest, answerRequest } from "./AttackNodeSheet";
import { useNameDrag, type NameDrag } from "@/lib/use-name-drag";
import {
  MAP_LAYOUTS,
  NODE_RADIUS,
  PATHS,
  isPathSlot,
  isUpperNodeSlot,
  pathLabelPosition,
  pathNodes,
  pathSlot,
  type AttackBoard,
  type AttackMember,
  type AttackSlot
} from "@/lib/attack-map";

// The regular war attack map: nine attack paths (nodes 1-36) that officers
// assign, and nodes 37-50 on the upper islands that members book themselves.
//
// Officers get a player list and drag names onto paths and nodes, the same
// way as on the Big Things map. Everyone can tap a node: on 37-50 that books
// it (with an optional champion), or asks whoever booked it to hand it over.

// Theme colors (tailwind.config.ts), needed as raw values inside the SVG.
const C = {
  ink: "#0D0F14",
  raised: "#20232C",
  line: "#2F333F",
  lighter: "#474C5C",
  parchment: "#EEF0F7",
  dim: "#A3A9C2",
  faint: "#6E7591",
  brass: "#E0A93B",
  brassBright: "#F6C861",
  teal: "#2FA88A",
  tealBright: "#4FD1A9",
  crimson: "#C2364E",
  crimsonBright: "#F05A72"
};

const layout = MAP_LAYOUTS.regular;
// Node number to its spot on the map, for drawing the path highlights.
const NODE_POSITION = new Map(layout.nodes.map((node) => [node.node, node]));

// Set to false to turn off the animation that plays when someone is put on a
// path or node (styles are the attack-* classes in globals.css).
const ASSIGN_ANIMATION = true;
// Delay between each node lighting up as the sweep climbs a path.
const SWEEP_STEP_MS = 110;
// When the name lands on the path button, after the sweep reaches the top.
const NAME_DROP_DELAY_MS = 4 * SWEEP_STEP_MS + 120;
// How often an open map checks for other people's bookings and requests.
const REFRESH_MS = 30_000;

function shortName(name: string, max = 9): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function slotLabel(slot: AttackSlot): string {
  return isPathSlot(slot) ? `Path ${slot.slice(5)}` : `Node ${slot.slice(5)}`;
}

/**
 * The board after an officer drops a member on a slot, mirroring the server
 * so the map updates before the save comes back.
 */
function moveLocally(board: AttackBoard, slot: AttackSlot, member: AttackMember, from: AttackSlot | null): AttackBoard {
  const assignments = { ...board.assignments };
  const champions = { ...board.champions };
  if (isPathSlot(slot)) {
    // One path per player.
    for (const path of PATHS) {
      const other = pathSlot(path);
      if (assignments[other]?.userId === member.userId) delete assignments[other];
    }
  } else if (from && isUpperNodeSlot(from) && from !== slot) {
    delete assignments[from];
    delete champions[from];
  }
  assignments[slot] = member;
  delete champions[slot];
  const requests = (board.requests ?? []).filter((request) => request.slot !== slot && request.slot !== from);
  return { ...board, assignments, champions, requests };
}

function clearLocally(board: AttackBoard, slot: AttackSlot): AttackBoard {
  const assignments = { ...board.assignments };
  const champions = { ...board.champions };
  delete assignments[slot];
  delete champions[slot];
  return { ...board, assignments, champions, requests: (board.requests ?? []).filter((request) => request.slot !== slot) };
}

export default function AttackMap({
  boards: initialBoards,
  viewerId,
  isOfficer,
  initialBattlegroup,
  initialNode,
  nextReset
}: {
  boards: AttackBoard[];
  viewerId: string;
  isOfficer: boolean;
  initialBattlegroup: number;
  /** A node to open straight away, e.g. from a notification. */
  initialNode?: number | null;
  /** When nodes 37-50 next clear, already formatted. */
  nextReset: string;
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [active, setActive] = useState(() =>
    Math.max(0, initialBoards.findIndex((board) => board.battlegroup === initialBattlegroup))
  );
  const [openSlot, setOpenSlot] = useState<AttackSlot | null>(() => {
    const node = layout.nodes.find((n) => n.node === initialNode);
    return node?.slot ?? null;
  });
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The slot that just got a player, so its animation plays once. The id makes
  // the animated elements remount, replaying it on every new assignment.
  const [equipped, setEquipped] = useState<{ slot: AttackSlot; id: number } | null>(null);

  const board = boards[active]!;
  const viewerInBoard = board.members.some((member) => member.userId === viewerId);
  const holderOf = (slot: AttackSlot): AttackMember | undefined => board.assignments[slot];

  const replaceBoard = useCallback((updated: AttackBoard) => {
    setBoards((current) => current.map((b) => (b.battlegroup === updated.battlegroup ? updated : b)));
  }, []);

  useEffect(() => {
    if (!equipped) return;
    const timeout = window.setTimeout(() => setEquipped(null), NAME_DROP_DELAY_MS + 1000);
    return () => window.clearTimeout(timeout);
  }, [equipped]);

  async function save(slot: AttackSlot, userId: string | null, optimistic: AttackBoard, moveFrom: AttackSlot | null = null) {
    const before = board;
    setError(null);
    setSaving(true);
    replaceBoard(optimistic);
    try {
      const res = await fetch("/api/attack-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "regular", battlegroup: board.battlegroup, slot, userId, moveFrom })
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

  function drop({ member, from, over }: NameDrag) {
    if (over) {
      if (over === from || holderOf(over)?.userId === member.userId) return;
      if (ASSIGN_ANIMATION) setEquipped({ slot: over, id: Date.now() });
      void save(over, member.userId, moveLocally(board, over, member, from), from);
    } else if (from) {
      // Thrown off the map: take them off it.
      void save(from, null, clearLocally(board, from));
    }
  }

  const { drag, pressHandlers, clickSuppressed, cancel } = useNameDrag({ enabled: isOfficer && !saving, onDrop: drop });

  // Pick up other people's bookings and requests while the page is open.
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current || document.visibilityState !== "visible") return;
    refreshing.current = true;
    try {
      const res = await fetch(`/api/attack-assignments?mode=regular&battlegroup=${board.battlegroup}`);
      if (res.ok) {
        const data = await res.json();
        replaceBoard(data.board as AttackBoard);
      }
    } catch {
      // Offline for a moment; the next refresh catches up.
    } finally {
      refreshing.current = false;
    }
  }, [board.battlegroup, replaceBoard]);

  useEffect(() => {
    if (drag || saving) return;
    const interval = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, drag, saving]);

  function switchBoard(index: number) {
    cancel();
    setActive(index);
    setOpenSlot(null);
    setError(null);
    setEquipped(null);
    // Keep the open battlegroup in the URL so a refresh returns to it.
    const url = new URL(window.location.href);
    url.searchParams.set("bg", String(boards[index]!.battlegroup));
    url.searchParams.delete("node");
    window.history.replaceState(null, "", url);
  }

  function openNode(slot: AttackSlot) {
    if (clickSuppressed()) return;
    setOpenSlot(slot);
  }

  async function answer(requestId: string, reply: "accept" | "decline" | "cancel") {
    setAnswering(requestId);
    setError(null);
    try {
      replaceBoard(await answerRequest(requestId, reply));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't answer that request.");
    } finally {
      setAnswering(null);
    }
  }

  const slotsOf = (userId: string): AttackSlot[] =>
    (Object.keys(board.assignments) as AttackSlot[])
      .filter((slot) => board.assignments[slot]?.userId === userId)
      .sort((a, b) => Number(isUpperNodeSlot(a)) - Number(isUpperNodeSlot(b)) || Number(a.slice(5)) - Number(b.slice(5)));
  const sortedMembers = [...board.members].sort((a, b) => {
    if (a.userId === viewerId) return -1;
    if (b.userId === viewerId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
  const requests = board.requests ?? [];
  const incoming = requests.filter((request) => board.assignments[request.slot]?.userId === viewerId);
  const outgoing = requests.filter((request) => request.requester.userId === viewerId);

  const map = (
    <div className="panel p-3 sm:p-5">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full max-w-[640px] mx-auto block select-none"
        style={{ WebkitTouchCallout: "none" }}
        role="group"
        aria-label={`Battlegroup ${board.battlegroup} attack map`}
      >
        <defs>
          <filter id="attack-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {layout.islands.map((island, i) => (
          <polygon key={i} points={island.points} fill={island.boss ? "#2A1A22" : C.ink} fillOpacity={0.75} />
        ))}

        {/* While dragging over a path, light up its whole column. */}
        {drag?.over &&
          isPathSlot(drag.over) &&
          (() => {
            const nodes = pathNodes(Number(drag.over.slice(5))).map((n) => NODE_POSITION.get(n)!);
            const x = nodes[0]!.x;
            return (
              <rect
                x={x - NODE_RADIUS - 6}
                y={nodes[3]!.y - NODE_RADIUS - 6}
                width={(NODE_RADIUS + 6) * 2}
                height={nodes[0]!.y - nodes[3]!.y + (NODE_RADIUS + 6) * 2}
                rx={NODE_RADIUS + 6}
                fill={`${C.tealBright}26`}
                stroke={`${C.tealBright}AA`}
                strokeWidth={2}
                className="pointer-events-none"
              />
            );
          })()}

        {layout.islands.map((island, i) => (
          <g key={i} className="pointer-events-none">
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

        {equipped &&
          isPathSlot(equipped.slot) &&
          (() => {
            const nodes = pathNodes(Number(equipped.slot.slice(5))).map((n) => NODE_POSITION.get(n)!);
            return (
              <g key={equipped.id} className="pointer-events-none">
                {[
                  { width: 18, opacity: 0.3 },
                  { width: 7, opacity: 1 }
                ].map(({ width, opacity }) => (
                  <line
                    key={width}
                    x1={nodes[0]!.x}
                    y1={nodes[0]!.y}
                    x2={nodes[3]!.x}
                    y2={nodes[3]!.y}
                    pathLength={1}
                    stroke={C.brassBright}
                    strokeOpacity={opacity}
                    strokeWidth={width}
                    strokeLinecap="round"
                    className="attack-path-sweep"
                  />
                ))}
              </g>
            );
          })()}

        {layout.nodes.map((node) => {
          const holder = holderOf(node.slot);
          const isPath = isPathSlot(node.slot);
          const liftedHere = drag?.from === node.slot;
          const shownHolder = liftedHere ? undefined : holder;
          const mine = shownHolder?.userId === viewerId;
          const hovered = drag?.over === node.slot && drag.from !== node.slot;
          const sweepStep =
            equipped?.slot === node.slot ? (isPath ? pathNodes(Number(node.slot.slice(5))).indexOf(node.node) : 0) : -1;
          const animDelay = sweepStep >= 0 ? { animationDelay: `${sweepStep * SWEEP_STEP_MS}ms` } : undefined;
          const isBoss = node.node === layout.bossNode;
          const fill = shownHolder ? (mine ? C.teal : C.brass) : C.raised;
          const label = !isPath && shownHolder ? shortName(shownHolder.displayName) : null;
          const hasChampion = !isPath && Boolean(board.champions?.[node.slot]);
          const asked = !isPath && requests.some((request) => request.slot === node.slot);
          const draggable = isOfficer && holder;
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
              {/* A larger invisible circle so nodes are easy to hit with a finger. */}
              <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 12} fill="transparent" />
              {hovered && !isPath && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 8}
                  fill={C.tealBright}
                  opacity={0.55}
                  filter="url(#attack-glow)"
                  className="pointer-events-none"
                />
              )}
              {sweepStep >= 0 && (
                <circle
                  key={`flash-${equipped!.id}`}
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS}
                  fill="none"
                  stroke={C.brassBright}
                  strokeWidth={3}
                  className="attack-node-flash pointer-events-none"
                  style={animDelay}
                />
              )}
              <g key={sweepStep >= 0 ? equipped!.id : "still"} className={sweepStep >= 0 ? "attack-node-pop" : undefined} style={animDelay}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isBoss ? NODE_RADIUS + 4 : NODE_RADIUS}
                  fill={fill}
                  stroke={hovered ? C.tealBright : shownHolder ? `${C.brassBright}AA` : isBoss ? C.crimson : C.lighter}
                  strokeWidth={hovered ? 4 : 2}
                  strokeDasharray={liftedHere ? "4 4" : undefined}
                  className={sweepStep >= 0 ? "attack-node-light" : undefined}
                  style={animDelay}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={19}
                  fontWeight={700}
                  fill={shownHolder ? C.ink : C.parchment}
                  className={`font-stat pointer-events-none ${sweepStep >= 0 ? "attack-node-light-text" : ""}`}
                  style={animDelay}
                >
                  {node.node}
                </text>
              </g>
              {/* A small dot when the holder has picked a champion, a ring when someone asked for the node. */}
              {hasChampion && !liftedHere && (
                <circle cx={node.x + 16} cy={node.y - 16} r={5} fill={C.parchment} stroke={C.ink} strokeWidth={2} className="pointer-events-none" />
              )}
              {asked && !liftedHere && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={NODE_RADIUS + 5}
                  fill="none"
                  stroke={C.tealBright}
                  strokeWidth={2}
                  strokeDasharray="3 4"
                  className="pointer-events-none"
                />
              )}
              {label &&
                (() => {
                  const y = layout.labelAbove.has(node.node) ? node.y - NODE_RADIUS - 13 : node.y + NODE_RADIUS + 13;
                  const width = label.length * 7.5 + 12;
                  return (
                    <g
                      key={sweepStep >= 0 ? `label-${equipped!.id}` : "label"}
                      className={`pointer-events-none ${sweepStep >= 0 ? "attack-name-drop" : ""}`}
                      style={sweepStep >= 0 ? { animationDelay: "200ms" } : undefined}
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
                    </g>
                  );
                })()}
            </g>
          );
        })}

        {PATHS.map((path) => {
          const { x, y } = pathLabelPosition(path);
          const slot = pathSlot(path);
          const holder = holderOf(slot);
          const liftedHere = drag?.from === slot;
          const shownHolder = liftedHere ? undefined : holder;
          const mine = shownHolder?.userId === viewerId;
          const hovered = drag?.over === slot && drag.from !== slot;
          const justEquipped = equipped?.slot === slot;
          return (
            <g
              key={path}
              data-attack-slot={slot}
              role="button"
              tabIndex={0}
              aria-label={`Path ${path}${holder ? `, ${holder.displayName}` : ", open"}`}
              onClick={() => openNode(slot)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openNode(slot);
                }
              }}
              className={`outline-none ${isOfficer && holder ? "cursor-grab" : "cursor-pointer"}`}
              {...pressHandlers(holder, slot)}
            >
              <rect
                x={x - 34}
                y={y - 22}
                width={68}
                height={60}
                rx={10}
                fill={hovered ? `${C.tealBright}26` : `${C.raised}CC`}
                stroke={hovered ? C.tealBright : shownHolder ? `${C.brass}99` : C.line}
                strokeWidth={hovered ? 2.5 : 1.5}
                strokeDasharray={liftedHere ? "4 4" : undefined}
              />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={700} fill={C.dim} className="font-display pointer-events-none">
                PATH {path}
              </text>
              {justEquipped && (
                <rect
                  key={`burst-${equipped!.id}`}
                  x={x - 34}
                  y={y - 22}
                  width={68}
                  height={60}
                  rx={10}
                  fill="none"
                  stroke={C.brassBright}
                  strokeWidth={3}
                  className="attack-burst pointer-events-none"
                  style={{ animationDelay: `${NAME_DROP_DELAY_MS}ms` }}
                />
              )}
              <text
                key={justEquipped ? `name-${equipped!.id}` : "name"}
                x={x}
                y={y + 22}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={600}
                fill={mine ? C.tealBright : shownHolder ? C.brassBright : C.faint}
                className={`pointer-events-none ${justEquipped ? "attack-name-drop" : ""}`}
                style={justEquipped ? { animationDelay: `${NAME_DROP_DELAY_MS}ms` } : undefined}
              >
                {shownHolder ? shortName(shownHolder.displayName, 8) : "open"}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-parchment-faint">
        <Legend color={C.teal} label="You" />
        <Legend color={C.brass} label="Taken" />
        <Legend color={C.raised} border={C.lighter} label="Open" />
        <span>Tap a node in 37-50 to book it.</span>
      </div>
    </div>
  );

  return (
    <div>
      <SlidingTabs
        tabs={boards.map((b) => ({ key: b.battlegroup, label: `BG ${b.battlegroup}` }))}
        active={active}
        onSelect={switchBoard}
      />

      <div key={board.battlegroup} className="fx-fade-in space-y-4">
        <p className="flex items-center gap-2 text-xs text-parchment-faint">
          <Clock size={13} className="shrink-0" aria-hidden />
          Nodes 37-50 clear for the next war on {nextReset}.
        </p>
        {error && <p className="text-sm text-crimson-bright">{error}</p>}
        {board.members.length === 0 ? (
          <p className="text-sm text-parchment-faint">
            No members are in Battlegroup {board.battlegroup} yet. Officers can add them on the Battlegroups page.
          </p>
        ) : (
          !isOfficer &&
          !viewerInBoard && (
            <p className="text-sm text-parchment-faint">You&apos;re not in Battlegroup {board.battlegroup}, so this map is view only.</p>
          )
        )}

        {incoming.length > 0 && (
          <section className="panel p-4 max-w-2xl">
            <h2 className="mb-2 font-display text-lg font-semibold">Requests for your nodes</h2>
            <ul className="space-y-2">
              {incoming.map((request) => (
                <IncomingRequest
                  key={request.id}
                  request={request}
                  busy={answering !== null}
                  onAnswer={(reply) => answer(request.id, reply)}
                />
              ))}
            </ul>
          </section>
        )}
        {outgoing.length > 0 && (
          <ul className="space-y-1.5 max-w-2xl">
            {outgoing.map((request) => (
              <li key={request.id} className="flex items-center gap-3 rounded-lg border border-ink-line/70 bg-ink/40 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 text-parchment-dim">
                  You asked {board.assignments[request.slot]?.displayName ?? "the holder"} for{" "}
                  <span className="text-parchment">{slotLabel(request.slot)}</span>. Waiting for an answer.
                </span>
                <button
                  className="btn-ghost shrink-0 px-2.5 py-1 text-xs"
                  disabled={answering !== null}
                  onClick={() => answer(request.id, "cancel")}
                >
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        )}

        {isOfficer ? (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] gap-6 items-start">
            {map}
            <section className="panel p-4 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-lg font-semibold">Battlegroup {board.battlegroup} players</h2>
                {saving && <Loader2 size={14} className="animate-spin text-brass-bright" aria-label="Saving" />}
              </div>
              <p className="text-xs text-parchment-faint mb-3">
                Drag a name onto a path (any of its nodes) or onto a node in 37-50. Each player runs one path. Drag a name
                off the map to clear it. On a phone, press and hold a name first.
              </p>
              {sortedMembers.length === 0 ? (
                <p className="text-sm text-parchment-faint">Nobody here yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {sortedMembers.map((member) => {
                    const slots = slotsOf(member.userId);
                    const mine = member.userId === viewerId;
                    const lifted = drag?.member.userId === member.userId && drag.from === null;
                    return (
                      <li
                        key={member.userId}
                        {...pressHandlers(member, null)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 select-none cursor-grab transition-opacity ${
                          mine ? "border-teal/50 bg-teal/10" : "border-ink-line/70 bg-ink/40"
                        } ${lifted ? "opacity-40" : ""}`}
                        style={{ WebkitTouchCallout: "none" }}
                      >
                        <GripVertical size={16} className="shrink-0 text-parchment-faint" aria-hidden />
                        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${mine ? "text-teal-bright" : "text-parchment"}`}>
                          {member.displayName}
                          {mine && <span className="ml-1 text-xs font-normal text-parchment-faint">(you)</span>}
                        </span>
                        {slots.length === 0 ? (
                          <span className="shrink-0 text-xs text-parchment-faint">No spot</span>
                        ) : (
                          <span className="flex shrink-0 flex-wrap justify-end gap-1 max-w-[55%]">
                            {slots.map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onTouchStart={(event) => event.stopPropagation()}
                                onClick={() => openNode(slot)}
                                className="rounded-full border border-brass/50 px-2 py-0.5 text-xs text-brass-bright hover:bg-brass/10"
                              >
                                {isPathSlot(slot) ? `P${slot.slice(5)}` : `N${slot.slice(5)}`}
                              </button>
                            ))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : (
          map
        )}
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] rounded-full border border-brass-bright bg-ink-raised px-3 py-1.5 text-sm font-semibold text-brass-bright shadow-lg shadow-black/50"
          style={{
            left: drag.x,
            top: drag.y,
            transform: drag.touch ? "translate(-50%, -150%)" : "translate(12px, -50%)"
          }}
        >
          {drag.member.displayName}
          {drag.over && <span className="ml-1.5 text-xs font-normal text-parchment-dim">→ {slotLabel(drag.over)}</span>}
        </div>
      )}

      {openSlot && (
        <AttackNodeSheet
          key={`${board.battlegroup}-${openSlot}`}
          board={board}
          slot={openSlot}
          viewerId={viewerId}
          isOfficer={isOfficer}
          viewerInBoard={viewerInBoard}
          onBoard={replaceBoard}
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
