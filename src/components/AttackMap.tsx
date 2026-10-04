"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  MAP_HEIGHT,
  MAP_ISLANDS,
  MAP_NODES,
  MAP_WIDTH,
  NODE_RADIUS,
  PATHS,
  UPPER_ISLANDS,
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

const NODE_POSITION = new Map(MAP_NODES.map((node) => [node.node, node]));
// Upper nodes whose name label goes above the node so it doesn't collide with neighbours.
const LABEL_ABOVE = new Set([48, 49, 50]);

function shortName(name: string, max = 9): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export default function AttackMap({
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
  const [selected, setSelected] = useState<AttackSlot | null>(null);
  const [savingSlot, setSavingSlot] = useState<AttackSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const board = boards[active]!;
  const viewerInBoard = board.members.some((member) => member.userId === viewerId);
  const canPickUpper = isOfficer || viewerInBoard;

  function switchBoard(index: number) {
    setActive(index);
    setSelected(null);
    setError(null);
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
        body: JSON.stringify({ battlegroup: board.battlegroup, slot, userId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that assignment.");
        return;
      }
      const updated = data.board as AttackBoard;
      setBoards((current) => current.map((b) => (b.battlegroup === updated.battlegroup ? updated : b)));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSavingSlot(null);
    }
  }

  const holderOf = (slot: AttackSlot): AttackMember | undefined => board.assignments[slot];
  const pathCounts = new Map<string, number>();
  for (const path of PATHS) {
    const holder = holderOf(pathSlot(path));
    if (holder) pathCounts.set(holder.userId, (pathCounts.get(holder.userId) ?? 0) + 1);
  }
  const withoutSpot = board.members.filter(
    (member) => !Object.values(board.assignments).some((holder) => holder?.userId === member.userId)
  );

  return (
    <div>
      <div className="flex w-full sm:inline-flex sm:w-auto flex-wrap gap-1 mb-6 p-1 rounded-xl border border-ink-line/80 bg-ink-panel/80 shadow-panel">
        {boards.map((b, i) => (
          <button
            key={b.battlegroup}
            onClick={() => switchBoard(i)}
            className={`flex-1 sm:flex-none px-3 sm:px-5 py-2 rounded-lg font-display text-base font-semibold uppercase tracking-wider whitespace-nowrap transition-all ${
              i === active
                ? "bg-gradient-to-b from-brass-bright to-brass text-ink shadow-[0_4px_14px_-4px_rgba(246,200,97,0.6)]"
                : "text-parchment-dim hover:text-parchment hover:bg-white/[0.05]"
            }`}
          >
            BG {b.battlegroup}
          </button>
        ))}
      </div>

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
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            className="w-full max-w-[640px] mx-auto block select-none"
            role="group"
            aria-label={`Battlegroup ${board.battlegroup} attack map`}
          >
            <defs>
              <filter id="attack-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            {MAP_ISLANDS.map((island, i) => (
              <polygon key={i} points={island.points} fill={island.boss ? "#2A1A22" : C.ink} fillOpacity={0.75} />
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

            {MAP_ISLANDS.map((island, i) => (
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

            {MAP_NODES.map((node) => {
              const holder = holderOf(node.slot);
              const mine = holder?.userId === viewerId;
              const isSelected = selected === node.slot;
              const fill = mine ? C.teal : holder ? C.brass : C.raised;
              const isBoss = node.node === 50;
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
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isBoss ? NODE_RADIUS + 4 : NODE_RADIUS}
                    fill={fill}
                    stroke={isSelected ? C.brassBright : holder ? `${C.brassBright}AA` : isBoss ? C.crimson : C.lighter}
                    strokeWidth={isSelected ? 4 : 2}
                  />
                  <text
                    x={node.x}
                    y={node.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={19}
                    fontWeight={700}
                    fill={holder ? C.ink : C.parchment}
                    className="font-stat pointer-events-none"
                  >
                    {node.node}
                  </text>
                  {label &&
                    (() => {
                      const y = LABEL_ABOVE.has(node.node) ? node.y - NODE_RADIUS - 13 : node.y + NODE_RADIUS + 13;
                      const width = label.length * 7.5 + 12;
                      return (
                        <g className="pointer-events-none">
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
              const mine = holder?.userId === viewerId;
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
                  <text
                    x={x}
                    y={y + 22}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={13}
                    fontWeight={600}
                    fill={mine ? C.tealBright : holder ? C.brassBright : C.faint}
                    className="pointer-events-none"
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
          <section className="panel p-4">
            <h2 className="font-display text-lg font-semibold mb-1">Attack paths</h2>
            <p className="text-xs text-parchment-faint mb-3">
              {isOfficer ? "Pick who runs each path." : "Officers assign these paths."}
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
                            const count = pathCounts.get(member.userId) ?? 0;
                            return count > 0 ? `${member.displayName} (${count})` : member.displayName;
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

          <section className="panel p-4">
            <h2 className="font-display text-lg font-semibold mb-1">Upper islands</h2>
            <p className="text-xs text-parchment-faint mb-3">
              {canPickUpper
                ? "Take one open spot on any of these islands. Taking a new spot frees your old one."
                : "Members of this battlegroup pick their own spots here."}
            </p>
            <div className="space-y-4">
              {UPPER_ISLANDS.map((island) => (
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
                          subtitle={node === 50 ? "Boss" : undefined}
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
