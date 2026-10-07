"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import SlidingTabs from "./SlidingTabs";
import type { WarMode } from "@/lib/war-mode";
import {
  MAP_LAYOUTS,
  NODE_RADIUS,
  PATHS,
  nodeSlot,
  pathLabelPosition,
  pathNodes,
  pathSlot,
  type AttackBoard,
  type AttackMember,
  type AttackSlot
} from "@/lib/attack-map";

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

// Node number to its spot on the regular map, for drawing the path highlights.
const NODE_POSITION = new Map(MAP_LAYOUTS.regular.nodes.map((node) => [node.node, node]));

// Set to false to turn off the animation that plays when someone is put on a
// path or node (styles are the attack-* classes in globals.css).
const ASSIGN_ANIMATION = true;
// Delay between each node lighting up as the sweep climbs a path.
const SWEEP_STEP_MS = 110;
// When the name lands on the path button, after the sweep reaches the top.
const NAME_DROP_DELAY_MS = 4 * SWEEP_STEP_MS + 120;

function shortName(name: string, max = 9): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export default function AttackMap({
  mode = "regular",
  boards: initialBoards,
  viewerId,
  isOfficer,
  initialBattlegroup
}: {
  /** Which war mode's map to show; edits are saved to the same mode. */
  mode?: WarMode;
  boards: AttackBoard[];
  viewerId: string;
  isOfficer: boolean;
  initialBattlegroup: number;
}) {
  const [boards, setBoards] = useState(initialBoards);
  const [active, setActive] = useState(() =>
    Math.max(0, initialBoards.findIndex((board) => board.battlegroup === initialBattlegroup))
  );
  const [selected, setSelected] = useState<AttackSlot | null>(null);
  const [savingSlot, setSavingSlot] = useState<AttackSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The slot that just got a player, so its animation plays once. The id makes
  // the animated elements remount, replaying it on every new assignment.
  const [equipped, setEquipped] = useState<{ slot: AttackSlot; id: number } | null>(null);

  useEffect(() => {
    if (!equipped) return;
    const timeout = window.setTimeout(() => setEquipped(null), NAME_DROP_DELAY_MS + 1000);
    return () => window.clearTimeout(timeout);
  }, [equipped]);

  const layout = MAP_LAYOUTS[mode];
  const board = boards[active]!;
  const viewerInBoard = board.members.some((member) => member.userId === viewerId);
  const canPickUpper = isOfficer || viewerInBoard;

  function switchBoard(index: number) {
    setActive(index);
    setSelected(null);
    setError(null);
    setEquipped(null);
    // Keep the open battlegroup in the URL so a refresh returns to it.
    const url = new URL(window.location.href);
    url.searchParams.set("bg", String(boards[index]!.battlegroup));
    window.history.replaceState(null, "", url);
  }

  function selectSlot(slot: AttackSlot) {
    setSelected(slot);
    document
      .getElementById(`attack-row-${slot}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function setSlot(slot: AttackSlot, userId: string | null) {
    setError(null);
    setSavingSlot(slot);
    try {
      const res = await fetch("/api/attack-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, battlegroup: board.battlegroup, slot, userId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that assignment.");
        return;
      }
      const updated = data.board as AttackBoard;
      if (ASSIGN_ANIMATION && userId && board.assignments[slot]?.userId !== userId) {
        setEquipped({ slot, id: Date.now() });
      }
      setBoards((current) => current.map((b) => (b.battlegroup === updated.battlegroup ? updated : b)));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSavingSlot(null);
    }
  }

  const holderOf = (slot: AttackSlot): AttackMember | undefined => board.assignments[slot];
  // The path each member runs, shown in the path dropdowns.
  const pathOf = new Map<string, number>();
  for (const path of PATHS) {
    const holder = holderOf(pathSlot(path));
    if (holder) pathOf.set(holder.userId, path);
  }
  const withoutSpot = board.members.filter(
    (member) => !Object.values(board.assignments).some((holder) => holder?.userId === member.userId)
  );

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

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] gap-6 items-start">
          <div className="panel p-3 sm:p-5">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className={`w-full ${layout.hasPaths ? "max-w-[640px]" : "max-w-[520px]"} mx-auto block select-none`}
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

              {selected?.startsWith("path-") &&
                (() => {
                  const nodes = pathNodes(Number(selected.slice(5))).map((n) => NODE_POSITION.get(n)!);
                  const x = nodes[0]!.x;
                  return (
                    <rect
                      x={x - NODE_RADIUS - 6}
                      y={nodes[3]!.y - NODE_RADIUS - 6}
                      width={(NODE_RADIUS + 6) * 2}
                      height={nodes[0]!.y - nodes[3]!.y + (NODE_RADIUS + 6) * 2}
                      rx={NODE_RADIUS + 6}
                      fill={`${C.brassBright}1F`}
                      stroke={`${C.brassBright}80`}
                      strokeWidth={2}
                    />
                  );
                })()}

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

              {equipped?.slot.startsWith("path-") &&
                (() => {
                  const nodes = pathNodes(Number(equipped.slot.slice(5))).map((n) => NODE_POSITION.get(n)!);
                  // A wide faint stroke under a narrow bright one reads as a glow.
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
                // How far up the path this node is, for the order it lights in; -1 when not animating.
                const sweepStep =
                  equipped?.slot === node.slot
                    ? node.slot.startsWith("path-")
                      ? pathNodes(Number(node.slot.slice(5))).indexOf(node.node)
                      : 0
                    : -1;
                const animDelay = sweepStep >= 0 ? { animationDelay: `${sweepStep * SWEEP_STEP_MS}ms` } : undefined;
                const mine = holder?.userId === viewerId;
                const isSelected = selected === node.slot;
                const fill = mine ? C.teal : holder ? C.brass : C.raised;
                const isBoss = node.node === layout.bossNode;
                const label = !node.slot.startsWith("path-") && holder ? shortName(holder.displayName) : null;
                return (
                  <g
                    key={node.node}
                    role="button"
                    tabIndex={0}
                    aria-label={`Node ${node.node}${holder ? `, ${holder.displayName}` : ", open"}`}
                    onClick={() => selectSlot(node.slot)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectSlot(node.slot);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    {isSelected && (
                      <circle cx={node.x} cy={node.y} r={NODE_RADIUS + 6} fill={C.brassBright} opacity={0.45} filter="url(#attack-glow)" />
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
                    <g
                      key={sweepStep >= 0 ? equipped!.id : "still"}
                      className={sweepStep >= 0 ? "attack-node-pop" : undefined}
                      style={animDelay}
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isBoss ? NODE_RADIUS + 4 : NODE_RADIUS}
                        fill={fill}
                        stroke={isSelected ? C.brassBright : holder ? `${C.brassBright}AA` : isBoss ? C.crimson : C.lighter}
                        strokeWidth={isSelected ? 4 : 2}
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
                        fill={holder ? C.ink : C.parchment}
                        className={`font-stat pointer-events-none ${sweepStep >= 0 ? "attack-node-light-text" : ""}`}
                        style={animDelay}
                      >
                        {node.node}
                      </text>
                    </g>
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

              {layout.hasPaths && PATHS.map((path) => {
                const { x, y } = pathLabelPosition(path);
                const slot = pathSlot(path);
                const holder = holderOf(slot);
                const mine = holder?.userId === viewerId;
                const justEquipped = equipped?.slot === slot;
                return (
                  <g
                    key={path}
                    role="button"
                    tabIndex={0}
                    aria-label={`Path ${path}${holder ? `, ${holder.displayName}` : ", open"}`}
                    onClick={() => selectSlot(slot)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectSlot(slot);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <rect
                      x={x - 34}
                      y={y - 22}
                      width={68}
                      height={60}
                      rx={10}
                      fill={selected === slot ? `${C.brassBright}26` : `${C.raised}CC`}
                      stroke={selected === slot ? C.brassBright : holder ? `${C.brass}99` : C.line}
                      strokeWidth={selected === slot ? 2.5 : 1.5}
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
                      fill={mine ? C.tealBright : holder ? C.brassBright : C.faint}
                      className={`pointer-events-none ${justEquipped ? "attack-name-drop" : ""}`}
                      style={justEquipped ? { animationDelay: `${NAME_DROP_DELAY_MS}ms` } : undefined}
                    >
                      {holder ? shortName(holder.displayName, 8) : "open"}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-parchment-faint">
              <Legend color={C.teal} label="You" />
              <Legend color={C.brass} label="Assigned" />
              <Legend color={C.raised} border={C.lighter} label="Open" />
              <span>Tap a node to jump to it.</span>
            </div>
          </div>

          <div className="space-y-6 min-w-0">
            {layout.hasPaths && (
              <section className="panel p-4">
                <h2 className="font-display text-lg font-semibold mb-1">Attack paths</h2>
                <p className="text-xs text-parchment-faint mb-3">
                  {isOfficer
                    ? "Pick who runs each path. Each player runs one path, so picking someone moves them off their old one."
                    : "Officers assign these paths."}
                </p>
                <ul className="space-y-1.5">
                  {PATHS.map((path) => {
                    const slot = pathSlot(path);
                    return (
                      <SlotRow
                        key={slot}
                        slot={slot}
                        title={`Path ${path}`}
                        subtitle={`Nodes ${pathNodes(path).join(" · ")}`}
                        holder={holderOf(slot)}
                        selected={selected === slot}
                        saving={savingSlot === slot}
                        viewerId={viewerId}
                        onSelect={() => setSelected(slot)}
                        control={
                          isOfficer ? (
                            <MemberSelect
                              members={board.members}
                              value={holderOf(slot)?.userId ?? ""}
                              disabled={savingSlot !== null}
                              describe={(member) => {
                                const current = pathOf.get(member.userId);
                                return current && current !== path ? `${member.displayName} (Path ${current})` : member.displayName;
                              }}
                              onChange={(userId) => setSlot(slot, userId)}
                            />
                          ) : null
                        }
                      />
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="panel p-4">
              <h2 className="font-display text-lg font-semibold mb-1">{layout.pickTitle}</h2>
              <p className="text-xs text-parchment-faint mb-3">
                {canPickUpper
                  ? "Take any open spots on these islands. You can hold more than one."
                  : "Members of this battlegroup pick their own spots here."}
              </p>
              <div className="space-y-4">
                {layout.pickIslands.map((island) => (
                  <div key={island.name}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-parchment-dim">
                      {island.name}
                    </h3>
                    <ul className="space-y-1.5">
                      {island.nodes.map((node) => {
                        const slot = nodeSlot(node);
                        const holder = holderOf(slot);
                        let control: React.ReactNode = null;
                        if (isOfficer) {
                          control = (
                            <MemberSelect
                              members={board.members}
                              value={holder?.userId ?? ""}
                              disabled={savingSlot !== null}
                              onChange={(userId) => setSlot(slot, userId)}
                            />
                          );
                        } else if (viewerInBoard && holder?.userId === viewerId) {
                          control = (
                            <button className="btn-ghost px-3 py-1 text-xs" disabled={savingSlot !== null} onClick={() => setSlot(slot, null)}>
                              Leave
                            </button>
                          );
                        } else if (viewerInBoard && !holder) {
                          control = (
                            <button className="btn-primary px-3 py-1 text-xs" disabled={savingSlot !== null} onClick={() => setSlot(slot, viewerId)}>
                              Take
                            </button>
                          );
                        }
                        return (
                          <SlotRow
                            key={slot}
                            slot={slot}
                            title={`Node ${node}`}
                            subtitle={node === layout.bossNode ? "Boss" : undefined}
                            holder={holder}
                            selected={selected === slot}
                            saving={savingSlot === slot}
                            viewerId={viewerId}
                            onSelect={() => setSelected(slot)}
                            control={control}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {board.members.length > 0 && (
              <section className="panel p-4">
                <h2 className="font-display text-lg font-semibold mb-2">Without a spot</h2>
                {withoutSpot.length === 0 ? (
                  <p className="text-sm text-parchment-faint">Everyone in Battlegroup {board.battlegroup} has a spot.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {withoutSpot.map((member) => (
                      <span
                        key={member.userId}
                        className={`rounded-full border px-2.5 py-0.5 text-xs ${
                          member.userId === viewerId
                            ? "border-teal/60 text-teal-bright"
                            : "border-ink-line text-parchment-dim"
                        }`}
                      >
                        {member.displayName}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
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

function SlotRow({
  slot,
  title,
  subtitle,
  holder,
  selected,
  saving,
  viewerId,
  onSelect,
  control
}: {
  slot: AttackSlot;
  title: string;
  subtitle?: string;
  holder: AttackMember | undefined;
  selected: boolean;
  saving: boolean;
  viewerId: string;
  onSelect: () => void;
  control: React.ReactNode;
}) {
  const mine = holder?.userId === viewerId;
  return (
    <li
      id={`attack-row-${slot}`}
      onClick={onSelect}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors scroll-mt-20 ${
        selected ? "border-brass/70 bg-brass/10" : "border-ink-line/70 bg-ink/40"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-parchment">{title}</div>
        {subtitle && <div className="text-[11px] text-parchment-faint truncate">{subtitle}</div>}
      </div>
      {saving && <Loader2 size={14} className="animate-spin text-brass-bright shrink-0" aria-hidden />}
      {control ?? (
        <span className={`text-sm truncate max-w-[45%] ${mine ? "text-teal-bright" : holder ? "text-brass-bright" : "text-parchment-faint"}`}>
          {holder?.displayName ?? "Open"}
        </span>
      )}
    </li>
  );
}

function MemberSelect({
  members,
  value,
  disabled,
  describe = (member) => member.displayName,
  onChange
}: {
  members: AttackMember[];
  value: string;
  disabled: boolean;
  describe?: (member: AttackMember) => string;
  onChange: (userId: string | null) => void;
}) {
  return (
    <select
      className="field-input w-40 sm:w-44 shrink-0 py-1.5 text-sm"
      value={value}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">Open</option>
      {members.map((member) => (
        <option key={member.userId} value={member.userId}>
          {describe(member)}
        </option>
      ))}
    </select>
  );
}
