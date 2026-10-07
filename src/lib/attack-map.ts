// Alliance war attack map layouts and assignment types. Safe to import from client code.
//
// Regular wars use a 50-node map. The bottom section is three columns of two
// stacked hex islands (nodes 1-36) in four rows of nine: 1-9 is the bottom row,
// 28-36 the top. Each column of four nodes is one attack path, so path p is
// nodes p, p+9, p+18 and p+27, and paths 1-9 run left to right. Above the
// columns are three diamond islands (40-42 left, 43-45 middle, 37-39 right) and
// the boss island (46-50) sits on top.
//
// Big Things wars use a 10-node map of five two-node diamond islands: two rows
// of two (1-2 and 3-4 at the bottom, 5-6 and 7-8 above them) and one island
// (9-10) at the top centre, with a short bar marking each end of the map. It
// has no attack paths; members pick every node for themselves.

import type { WarMode } from "./war-mode";

export const PATH_COUNT = 9;
export const PATHS = Array.from({ length: PATH_COUNT }, (_, i) => i + 1);
/** Nodes on the diamond and boss islands, which members pick for themselves. */
export const UPPER_NODES = Array.from({ length: 14 }, (_, i) => i + 37);
/** Every node on the Big Things map. */
export const BIG_THINGS_NODES = Array.from({ length: 10 }, (_, i) => i + 1);

export type AttackSlot = `path-${number}` | `node-${number}`;

export function pathSlot(path: number): AttackSlot {
  return `path-${path}`;
}

export function nodeSlot(node: number): AttackSlot {
  return `node-${node}`;
}

export function isValidSlot(slot: string, mode: WarMode = "regular"): slot is AttackSlot {
  const path = /^path-(\d+)$/.exec(slot);
  if (path) return mode === "regular" && PATHS.includes(Number(path[1]));
  const node = /^node-(\d+)$/.exec(slot);
  const pickable = mode === "regular" ? UPPER_NODES : BIG_THINGS_NODES;
  return Boolean(node && pickable.includes(Number(node[1])));
}

export function isPathSlot(slot: string): boolean {
  return slot.startsWith("path-");
}

/** The four nodes of an attack path, bottom to top. */
export function pathNodes(path: number): number[] {
  return [0, 1, 2, 3].map((row) => row * PATH_COUNT + path);
}

export type AttackMember = { userId: string; displayName: string };

export type AttackBoard = {
  battlegroup: 1 | 2 | 3;
  members: AttackMember[];
  /** Slot key to the member holding it. Empty slots are left out. */
  assignments: Partial<Record<AttackSlot, AttackMember>>;
};

// --- Drawing geometry (SVG user units) -------------------------------------

export const NODE_RADIUS = 22;

type Point = [number, number];
export type MapNode = { node: number; x: number; y: number; slot: AttackSlot };
/** An island drawn as a faint shape with dashed edges and small markers at its tips. */
export type MapIsland = { points: string; edges: [Point, Point][]; markers: Point[]; boss?: boolean };

export type MapLayout = {
  width: number;
  height: number;
  nodes: MapNode[];
  islands: MapIsland[];
  /** Centres of the short bars marking the ends of the map. */
  endBars: Point[];
  /** Whether the map has the nine officer-assigned attack paths. */
  hasPaths: boolean;
  /** Islands members pick spots on, in the order the side panel lists them. */
  pickIslands: { name: string; nodes: number[] }[];
  /** The panel heading for those islands. */
  pickTitle: string;
  bossNode: number | null;
  /** Nodes whose name label goes above the node so it doesn't collide with neighbours. */
  labelAbove: Set<number>;
};

/**
 * An island whose nodes sit in one or more rows, joined to a tip above and
 * below: the hex islands have two rows of three, the diamonds one row.
 */
function rowIsland(cx: number, rows: Point[][], top: number, bottom: number): MapIsland {
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const edges: [Point, Point][] = [];
  for (const point of first) edges.push([[cx, top], point]);
  for (let r = 0; r < rows.length - 1; r++) rows[r]!.forEach((point, i) => edges.push([point, rows[r + 1]![i]!]));
  for (const point of last) edges.push([point, [cx, bottom]]);
  const outline: Point[] = [[cx, top], first[first.length - 1]!, last[last.length - 1]!, [cx, bottom], last[0]!, first[0]!];
  return { points: outline.map((p) => p.join(",")).join(" "), edges, markers: [[cx, top], [cx, bottom]] };
}

const COLUMN_X = [120, 356, 592];
const NODE_DX = 74;

function regularLayout(): MapLayout {
  const nodes: MapNode[] = [];
  const islands: MapIsland[] = [];
  const addNode = (node: number, x: number, y: number, slot: AttackSlot) => nodes.push({ node, x, y, slot });

  // Row 0 is nodes 1-9 at the bottom, row 3 is nodes 28-36.
  const ROW_Y = [623, 560, 465, 402];

  for (const path of PATHS) {
    const { x } = pathLabelPosition(path);
    pathNodes(path).forEach((node, row) => addNode(node, x, ROW_Y[row]!, pathSlot(path)));
  }
  for (const cx of COLUMN_X) {
    const row = (y: number): Point[] => [-1, 0, 1].map((i) => [cx + i * NODE_DX, y]);
    islands.push(rowIsland(cx, [row(ROW_Y[3]!), row(ROW_Y[2]!)], 364, 503));
    islands.push(rowIsland(cx, [row(ROW_Y[1]!), row(ROW_Y[0]!)], 522, 661));
  }

  // Diamonds: first node, column, row height. They sit at staggered heights.
  const DIAMONDS: [number, number, number][] = [
    [40, 0, 275],
    [43, 1, 243],
    [37, 2, 275]
  ];
  for (const [first, column, y] of DIAMONDS) {
    const cx = COLUMN_X[column]!;
    const row: Point[] = [-1, 0, 1].map((i) => [cx + i * NODE_DX, y]);
    row.forEach(([x], i) => addNode(first + i, x, y, nodeSlot(first + i)));
    islands.push(rowIsland(cx, [row], y - 38, y + 38));
  }

  // Boss island: a hex with 46/47 at the bottom corners, 48/49 above them and 50 on top.
  const BOSS: Record<number, Point> = { 46: [282, 149], 47: [430, 149], 48: [282, 86], 49: [430, 86], 50: [356, 54] };
  for (const [node, [x, y]] of Object.entries(BOSS)) addNode(Number(node), x, y, nodeSlot(Number(node)));
  const bossTip: Point = [356, 180];
  islands.push({
    points: [BOSS[50]!, BOSS[49]!, BOSS[47]!, bossTip, BOSS[46]!, BOSS[48]!].map((p) => p.join(",")).join(" "),
    edges: [
      [BOSS[50]!, BOSS[48]!],
      [BOSS[50]!, BOSS[49]!],
      [BOSS[48]!, BOSS[46]!],
      [BOSS[49]!, BOSS[47]!],
      [BOSS[46]!, bossTip],
      [BOSS[47]!, bossTip]
    ],
    markers: [bossTip],
    boss: true
  });

  return {
    width: 712,
    height: 750,
    nodes,
    islands,
    endBars: [],
    hasPaths: true,
    pickIslands: [
      { name: "Left island", nodes: [40, 41, 42] },
      { name: "Middle island", nodes: [43, 44, 45] },
      { name: "Right island", nodes: [37, 38, 39] },
      { name: "Boss island", nodes: [46, 47, 48, 49, 50] }
    ],
    pickTitle: "Upper islands",
    bossNode: 50,
    labelAbove: new Set([48, 49, 50])
  };
}

function bigThingsLayout(): MapLayout {
  const nodes: MapNode[] = [];
  const islands: MapIsland[] = [];

  // Nodes sit at the side corners of flat diamonds, far enough apart that both
  // name labels fit below them with the island's tip marker between.
  const PAIR_DX = 56;
  const TIP_DY = 30;
  const LEFT_X = 150;
  const RIGHT_X = 450;
  const CENTRE_X = 300;

  // First node, centre x, centre y; listed bottom to top.
  const ISLANDS: [number, number, number][] = [
    [1, LEFT_X, 480],
    [3, RIGHT_X, 480],
    [5, LEFT_X, 315],
    [7, RIGHT_X, 315],
    [9, CENTRE_X, 150]
  ];
  for (const [first, cx, y] of ISLANDS) {
    const row: Point[] = [-1, 1].map((i) => [cx + i * PAIR_DX, y]);
    row.forEach(([x], i) => nodes.push({ node: first + i, x, y, slot: nodeSlot(first + i) }));
    islands.push(rowIsland(cx, [row], y - TIP_DY, y + TIP_DY));
  }

  return {
    width: 600,
    height: 640,
    nodes,
    islands,
    endBars: [
      [CENTRE_X, 50],
      [CENTRE_X, 590]
    ],
    hasPaths: false,
    // Top to bottom, as they read on the map.
    pickIslands: [
      { name: "Top island", nodes: [9, 10] },
      { name: "Middle left", nodes: [5, 6] },
      { name: "Middle right", nodes: [7, 8] },
      { name: "Bottom left", nodes: [1, 2] },
      { name: "Bottom right", nodes: [3, 4] }
    ],
    pickTitle: "Islands",
    bossNode: null,
    labelAbove: new Set()
  };
}

export const MAP_LAYOUTS: Record<WarMode, MapLayout> = {
  regular: regularLayout(),
  bigThings: bigThingsLayout()
};

/** Where each regular path's label and assignee name are drawn, under its column of nodes. */
export function pathLabelPosition(path: number): { x: number; y: number } {
  const column = Math.floor((path - 1) / 3);
  return { x: COLUMN_X[column]! + ((path - 1) % 3 - 1) * NODE_DX, y: 694 };
}
