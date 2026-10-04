// Alliance war attack map layout and assignment types. Safe to import from client code.
//
// The map has 50 nodes. The bottom section is three columns of two stacked hex
// islands (nodes 1-36) in four rows of nine: 1-9 is the bottom row, 28-36 the
// top. Each column of four nodes is one attack path, so path p is nodes
// p, p+9, p+18 and p+27, and paths 1-9 run left to right. Above the columns are
// three diamond islands (40-42 left, 43-45 middle, 37-39 right) and the boss
// island (46-50) sits on top.

export const PATH_COUNT = 9;
export const PATHS = Array.from({ length: PATH_COUNT }, (_, i) => i + 1);
/** Nodes on the diamond and boss islands, which members pick for themselves. */
export const UPPER_NODES = Array.from({ length: 14 }, (_, i) => i + 37);

export type AttackSlot = `path-${number}` | `node-${number}`;

export function pathSlot(path: number): AttackSlot {
  return `path-${path}`;
}

export function nodeSlot(node: number): AttackSlot {
  return `node-${node}`;
}

export function isValidSlot(slot: string): slot is AttackSlot {
  const path = /^path-(\d+)$/.exec(slot);
  if (path) return PATHS.includes(Number(path[1]));
  const node = /^node-(\d+)$/.exec(slot);
  return Boolean(node && UPPER_NODES.includes(Number(node[1])));
}

export function isPathSlot(slot: string): boolean {
  return slot.startsWith("path-");
}

/** The four nodes of an attack path, bottom to top. */
export function pathNodes(path: number): number[] {
  return [0, 1, 2, 3].map((row) => row * PATH_COUNT + path);
}

export function upperNodeIsland(node: number): string {
  if (node >= 46) return node === 50 ? "Boss" : "Boss island";
  if (node >= 43) return "Middle diamond";
  return node >= 40 ? "Left diamond" : "Right diamond";
}

export type AttackMember = { userId: string; displayName: string };

export type AttackBoard = {
  battlegroup: 1 | 2 | 3;
  members: AttackMember[];
  /** Slot key to the member holding it. Empty slots are left out. */
  assignments: Partial<Record<AttackSlot, AttackMember>>;
};

// --- Drawing geometry (SVG user units) -------------------------------------

export const MAP_WIDTH = 712;
export const MAP_HEIGHT = 750;
export const NODE_RADIUS = 22;

type Point = [number, number];
export type MapNode = { node: number; x: number; y: number; slot: AttackSlot };
/** An island drawn as a faint shape with dashed edges and small markers at its tips. */
export type MapIsland = { points: string; edges: [Point, Point][]; markers: Point[]; boss?: boolean };

const COLUMN_X = [120, 356, 592];
const NODE_DX = 74;
// Row 0 is nodes 1-9 at the bottom, row 3 is nodes 28-36.
const ROW_Y = [623, 560, 465, 402];

const nodes: MapNode[] = [];
const islands: MapIsland[] = [];

function addNode(node: number, x: number, y: number, slot: AttackSlot) {
  nodes.push({ node, x, y, slot });
}

/**
 * An island whose nodes sit in one or more rows of three, joined to a tip
 * above and below: the hex islands have two rows, the diamonds one.
 */
function addRowIsland(cx: number, rows: Point[][], top: number, bottom: number) {
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const edges: [Point, Point][] = [];
  for (const point of first) edges.push([[cx, top], point]);
  for (let r = 0; r < rows.length - 1; r++) rows[r]!.forEach((point, i) => edges.push([point, rows[r + 1]![i]!]));
  for (const point of last) edges.push([point, [cx, bottom]]);
  const outline: Point[] = [[cx, top], first[2]!, last[2]!, [cx, bottom], last[0]!, first[0]!];
  islands.push({ points: outline.map((p) => p.join(",")).join(" "), edges, markers: [[cx, top], [cx, bottom]] });
}

for (const path of PATHS) {
  const column = Math.floor((path - 1) / 3);
  const x = COLUMN_X[column]! + ((path - 1) % 3 - 1) * NODE_DX;
  pathNodes(path).forEach((node, row) => addNode(node, x, ROW_Y[row]!, pathSlot(path)));
}
for (const cx of COLUMN_X) {
  const row = (y: number): Point[] => [-1, 0, 1].map((i) => [cx + i * NODE_DX, y]);
  addRowIsland(cx, [row(ROW_Y[3]!), row(ROW_Y[2]!)], 364, 503);
  addRowIsland(cx, [row(ROW_Y[1]!), row(ROW_Y[0]!)], 522, 661);
}

// Diamonds: first node, column, row height. They sit at staggered heights.
const DIAMONDS: [number, number, number][] = [
  [40, 0, 275],
  [43, 1, 243],
  [37, 2, 307]
];
for (const [first, column, y] of DIAMONDS) {
  const cx = COLUMN_X[column]!;
  const row: Point[] = [-1, 0, 1].map((i) => [cx + i * NODE_DX, y]);
  row.forEach(([x], i) => addNode(first + i, x, y, nodeSlot(first + i)));
  addRowIsland(cx, [row], y - 38, y + 38);
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

export const MAP_NODES: MapNode[] = nodes;
export const MAP_ISLANDS: MapIsland[] = islands;

/** Where each path's label and assignee name are drawn, under its column of nodes. */
export function pathLabelPosition(path: number): { x: number; y: number } {
  const column = Math.floor((path - 1) / 3);
  return { x: COLUMN_X[column]! + ((path - 1) % 3 - 1) * NODE_DX, y: 694 };
}
