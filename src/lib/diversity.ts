import { getDefenderTier, type DefenderTier } from "./defender-tiers";

export type RosterOwner = {
  userId: string;
  username: string;
  displayName: string;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  rating: number | null;
  awakened: boolean | null;
  ascended: boolean | null;
};

export type ChampionEntry = {
  championId: string;
  championName: string;
  championImageUrl: string | null;
  tier: DefenderTier;
  owners: RosterOwner[];
};

export type AssignedDefender = ChampionEntry & {
  assignedTo: RosterOwner;
};

export type MemberDefenderRow = {
  userId: string;
  displayName: string;
  defenders: AssignedDefender[];
  assigned: number;
  cap: number;
};

export type CurrentDefenderAssignment = {
  championId: string;
  userId: string;
};

/** A saved champion -> member assignment (used for both the suggested and current lists). */
export type DefenderAssignment = CurrentDefenderAssignment;

export type BattlegroupBoard = {
  battlegroup: number;
  memberCount: number;
  maxDefenders: number;
  suggestedDefenders: MemberDefenderRow[];
  currentDefenders: MemberDefenderRow[];
  additionalPossibleDefenders: AssignedDefender[];
  uniqueChampionsAssigned: number;
  priorityAssigned: number;
  mediumAssigned: number;
  currentUniqueChampionsAssigned: number;
  currentPriorityAssigned: number;
  currentMediumAssigned: number;
  estimatedDiversityPoints: number;
  pointsPerUniqueDefender: number;
  slotUsage: { userId: string; displayName: string; assigned: number; cap: number }[];
};

const POINTS_PER_UNIQUE_DEFENDER = 30;

type Member = { userId: string; username?: string; displayName: string };

type Candidate = {
  champion: ChampionEntry;
};

type AvailableChampion = {
  championId: string;
  championName: string;
  championImageUrl: string | null;
  tier: DefenderTier | null;
  owners: RosterOwner[];
};

export type RawRosterRow = {
  userId: string;
  username: string;
  displayName: string;
  championId: string;
  championName: string;
  championImageUrl: string | null;
  stars: number | null;
  rank: number | null;
  sigLevel: number | null;
  rating: number | null;
  awakened: boolean | null;
  ascended: boolean | null;
};

export type DefenderOverride = {
  championId: string;
  userId: string | null;
  blockedUserIds?: string[];
};

function compareOwnersByRating(a: RosterOwner, b: RosterOwner): number {
  const aRating = a.rating ?? -1;
  const bRating = b.rating ?? -1;
  if (aRating !== bRating) return bRating - aRating;

  const aStars = a.stars ?? -1;
  const bStars = b.stars ?? -1;
  if (aStars !== bStars) return bStars - aStars;
  const aRank = a.rank ?? -1;
  const bRank = b.rank ?? -1;
  if (aRank !== bRank) return bRank - aRank;
  return (b.sigLevel ?? -1) - (a.sigLevel ?? -1);
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.champion.tier !== b.champion.tier) {
    return a.champion.tier === "priority" ? -1 : 1;
  }

  const aRating = a.champion.owners[0]?.rating ?? -1;
  const bRating = b.champion.owners[0]?.rating ?? -1;
  if (aRating !== bRating) return bRating - aRating;
  return a.champion.championName.localeCompare(b.champion.championName);
}

type FlowEdge = { to: number; rev: number; capacity: number; cost: number };

function addEdge(graph: FlowEdge[][], from: number, to: number, capacity: number, cost: number) {
  const forward: FlowEdge = { to, rev: graph[to].length, capacity, cost };
  const reverse: FlowEdge = { to: from, rev: graph[from].length, capacity: 0, cost: -cost };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function minCostMaxFlow(graph: FlowEdge[][], source: number, sink: number, maxFlow: number) {
  let flow = 0;

  while (flow < maxFlow) {
    const distance = new Array(graph.length).fill(Number.POSITIVE_INFINITY) as number[];
    const inQueue = new Array(graph.length).fill(false) as boolean[];
    const prevNode = new Array(graph.length).fill(-1) as number[];
    const prevEdge = new Array(graph.length).fill(-1) as number[];
    const queue: number[] = [source];
    let head = 0;
    distance[source] = 0;
    inQueue[source] = true;

    while (head < queue.length) {
      const node = queue[head++];
      inQueue[node] = false;

      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0) continue;
        const nextDistance = distance[node] + edge.cost;
        if (nextDistance >= distance[edge.to]) continue;

        distance[edge.to] = nextDistance;
        prevNode[edge.to] = node;
        prevEdge[edge.to] = edgeIndex;

        if (!inQueue[edge.to]) {
          queue.push(edge.to);
          inQueue[edge.to] = true;
        }
      }
    }

    if (!Number.isFinite(distance[sink])) break;

    let pushed = maxFlow - flow;
    for (let node = sink; node !== source; node = prevNode[node]) {
      pushed = Math.min(pushed, graph[prevNode[node]][prevEdge[node]].capacity);
    }

    for (let node = sink; node !== source; node = prevNode[node]) {
      const previous = prevNode[node];
      const edgeIndex = prevEdge[node];
      const edge = graph[previous][edgeIndex];
      edge.capacity -= pushed;
      graph[node][edge.rev].capacity += pushed;
    }

    flow += pushed;
  }

  return flow;
}

/**
 * Selects as many unique defenders as possible while respecting every member's
 * five-slot capacity. A champion can be assigned to any member who owns it,
 * rather than only to the strongest owner. Rating/PI is still the strength
 * signal, so the strongest copy wins whenever capacity allows; a lower-rated
 * copy may be used when that is necessary to fill otherwise-unused defender
 * capacity.
 *
 * Explicit officer overrides are locked first. This makes manual assignments
 * stable even when the automatic planner is recalculated.
 */
function selectCandidates(
  candidates: Candidate[],
  members: Member[],
  maxDefendersPerMember: number,
  overrides: Map<string, DefenderOverride>
): AssignedDefender[] {
  if (candidates.length === 0 || members.length === 0) return [];

  const memberIndex = new Map(members.map((member, index) => [member.userId, index]));
  const capacity = new Map(members.map((member) => [member.userId, maxDefendersPerMember]));
  const selected: AssignedDefender[] = [];
  const lockedChampionIds = new Set<string>();

  // First honor explicit officer assignments.
  for (const candidate of candidates) {
    const override = overrides.get(candidate.champion.championId);
    if (!override?.userId) continue;

    const owner = candidate.champion.owners.find((entry) => entry.userId === override.userId);
    if (!owner || (override.blockedUserIds ?? []).includes(owner.userId)) continue;

    const remaining = capacity.get(owner.userId) ?? 0;
    if (remaining <= 0) continue;

    selected.push({ ...candidate.champion, assignedTo: owner });
    lockedChampionIds.add(candidate.champion.championId);
    capacity.set(owner.userId, remaining - 1);
  }

  const availableCandidates = candidates.filter((candidate) => {
    if (lockedChampionIds.has(candidate.champion.championId)) return false;
    const override = overrides.get(candidate.champion.championId);
    const blocked = new Set(override?.blockedUserIds ?? []);
    return candidate.champion.owners.some((owner) => {
      return !blocked.has(owner.userId) && (capacity.get(owner.userId) ?? 0) > 0;
    });
  });

  if (availableCandidates.length === 0) return selected;

  const source = 0;
  const championStart = 1;
  const memberStart = championStart + availableCandidates.length;
  const sink = memberStart + members.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  const maxRating = availableCandidates.reduce(
    (max, candidate) => Math.max(max, ...candidate.champion.owners.map((owner) => Math.max(0, owner.rating ?? 0))),
    0
  );
  const priorityBonus = maxRating + 1;

  availableCandidates.forEach((candidate, index) => {
    const championNode = championStart + index;
    addEdge(graph, source, championNode, 1, 0);

    const override = overrides.get(candidate.champion.championId);
    const blocked = new Set(override?.blockedUserIds ?? []);

    // One edge for every owner means the solver can use a lower-rated copy if
    // the highest-rated owner has already filled their five slots.
    for (const owner of candidate.champion.owners) {
      if (blocked.has(owner.userId)) continue;
      const member = memberIndex.get(owner.userId);
      if (member === undefined || (capacity.get(owner.userId) ?? 0) <= 0) continue;

      const rating = Math.max(0, owner.rating ?? 0);
      const score = (candidate.champion.tier === "priority" ? priorityBonus : 0) + rating;
      addEdge(graph, championNode, memberStart + member, 1, -score);
    }
  });

  members.forEach((member, index) => {
    addEdge(graph, memberStart + index, sink, capacity.get(member.userId) ?? 0, 0);
  });

  const remainingCapacity = Array.from(capacity.values()).reduce((sum, value) => sum + value, 0);
  const maxAssignments = Math.min(availableCandidates.length, remainingCapacity);
  minCostMaxFlow(graph, source, sink, maxAssignments);

  availableCandidates.forEach((candidate, index) => {
    const championNode = championStart + index;
    const sourceEdge = graph[source].find((edge) => edge.to === championNode);
    if (!sourceEdge || sourceEdge.capacity !== 0) return;

    const usedOwnerEdge = graph[championNode].find(
      (edge) => edge.to >= memberStart && edge.to < sink && edge.capacity === 0
    );
    if (!usedOwnerEdge) return;

    const assignedMember = members[usedOwnerEdge.to - memberStart];
    const owner = candidate.champion.owners.find((entry) => entry.userId === assignedMember.userId);
    if (!owner) return;

    selected.push({ ...candidate.champion, assignedTo: owner });
  });

  return selected;
}

function sortMemberDefenders(list: AssignedDefender[]) {
  list.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "priority" ? -1 : 1;
    const ratingDifference = (b.assignedTo.rating ?? -1) - (a.assignedTo.rating ?? -1);
    if (ratingDifference !== 0) return ratingDifference;
    return a.championName.localeCompare(b.championName);
  });
}

/**
 * Builds the defender plan for a battlegroup.
 *
 * The main plan contains up to 5 defenders per member. When a saved
 * `suggestedAssignments` snapshot is passed, the suggested plan is read from it
 * as-is so manual edits stay put; otherwise it is auto-generated from the
 * strongest curated defenders. The additional section contains every other
 * champion available to the battlegroup, ordered by defensive tier and PI.
 */
export function computeBattlegroupBoard(
  battlegroup: number,
  rows: RawRosterRow[],
  _allChampionNames: string[],
  members: Member[],
  maxDefendersPerMember = 5,
  overrides: DefenderOverride[] = [],
  currentAssignments: CurrentDefenderAssignment[] = [],
  suggestedAssignments: DefenderAssignment[] | null = null
): BattlegroupBoard {
  const allByChampion = new Map<string, AvailableChampion>();

  for (const row of rows) {
    const tier = getDefenderTier(row.championName);
    let entry = allByChampion.get(row.championId);
    if (!entry) {
      entry = {
        championId: row.championId,
        championName: row.championName,
        championImageUrl: row.championImageUrl,
        tier,
        owners: []
      };
      allByChampion.set(row.championId, entry);
    }

    // If the same champion somehow appears with inconsistent metadata, retain
    // the curated tier if any roster row identifies it as one.
    if (!entry.tier && tier) entry.tier = tier;

    entry.owners.push({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      stars: row.stars,
      rank: row.rank,
      sigLevel: row.sigLevel,
      rating: row.rating,
      awakened: row.awakened,
      ascended: row.ascended
    });
  }

  const allChampions = Array.from(allByChampion.values());
  for (const champion of allChampions) champion.owners.sort(compareOwnersByRating);

  const champions = allChampions.filter((champion): champion is ChampionEntry => champion.tier !== null);
  const candidates: Candidate[] = champions
    .filter((champion) => champion.owners.length > 0)
    .map((champion) => ({ champion }))
    .sort(compareCandidates);

  const overrideMap = new Map(overrides.map((override) => [override.championId, override]));

  // Resolve a saved snapshot against the live roster so cards still show
  // current PI and champion art without changing the stored assignment.
  // Entries whose member left the battlegroup or no longer owns the champion
  // are skipped, which frees that slot.
  const memberById = new Map(members.map((member) => [member.userId, member]));
  function resolveSnapshot(assignments: DefenderAssignment[]) {
    const byMember = new Map<string, AssignedDefender[]>();
    for (const member of members) byMember.set(member.userId, []);

    const ids = new Set<string>();
    for (const assignment of assignments) {
      if (ids.has(assignment.championId)) continue;
      const champion = allByChampion.get(assignment.championId);
      const member = memberById.get(assignment.userId);
      if (!champion || !member) continue;
      const owner = champion.owners.find((entry) => entry.userId === assignment.userId);
      if (!owner) continue;
      const list = byMember.get(member.userId) ?? [];
      if (list.length >= maxDefendersPerMember) continue;

      // Officers can hand-pick any roster champion, so non-curated champions
      // are shown as medium rather than dropped.
      list.push({ ...champion, tier: champion.tier ?? "medium", assignedTo: owner });
      byMember.set(member.userId, list);
      ids.add(assignment.championId);
    }

    for (const list of byMember.values()) sortMemberDefenders(list);

    const memberRows: MemberDefenderRow[] = members.map((member) => {
      const defenders = byMember.get(member.userId) ?? [];
      return {
        userId: member.userId,
        displayName: member.displayName,
        defenders,
        assigned: defenders.length,
        cap: maxDefendersPerMember
      };
    });
    return { memberRows, ids };
  }

  let suggestedDefenders: MemberDefenderRow[];
  let selectedIds: Set<string>;
  if (suggestedAssignments) {
    const resolved = resolveSnapshot(suggestedAssignments);
    suggestedDefenders = resolved.memberRows;
    selectedIds = resolved.ids;
  } else {
    const selected = selectCandidates(candidates, members, maxDefendersPerMember, overrideMap);
    selectedIds = new Set(selected.map((candidate) => candidate.championId));

    const defendersByMember = new Map<string, AssignedDefender[]>();
    for (const member of members) defendersByMember.set(member.userId, []);
    for (const defender of selected) {
      const list = defendersByMember.get(defender.assignedTo.userId);
      if (list) list.push(defender);
    }
    for (const list of defendersByMember.values()) sortMemberDefenders(list);

    suggestedDefenders = members.map((member) => {
      const defenders = defendersByMember.get(member.userId) ?? [];
      return {
        userId: member.userId,
        displayName: member.displayName,
        defenders,
        assigned: defenders.length,
        cap: maxDefendersPerMember
      };
    });
  }

  const { memberRows: currentDefenders, ids: seenCurrentChampions } = resolveSnapshot(currentAssignments);

  function buildAdditionalDefenders(excludedIds: Set<string>, blockedFor: (championId: string) => Set<string>) {
    return allChampions
      .filter((champion) => !excludedIds.has(champion.championId))
      .map((champion) => {
        const blocked = blockedFor(champion.championId);
        const bestAvailableOwner = champion.owners.find((owner) => !blocked.has(owner.userId)) ?? champion.owners[0];
        if (!bestAvailableOwner) return null;

        // Non-curated champions are retained in the additional pool but are
        // deliberately ranked after Priority and Medium defenders. This lets an
        // officer manually assign any roster champion without polluting the
        // automatic 50-slot recommendation.
        const displayChampion: ChampionEntry = {
          championId: champion.championId,
          championName: champion.championName,
          championImageUrl: champion.championImageUrl,
          tier: champion.tier ?? "medium",
          owners: champion.owners
        };
        return { ...displayChampion, assignedTo: bestAvailableOwner, _curated: champion.tier !== null };
      })
      .filter((value): value is AssignedDefender & { _curated: boolean } => value !== null)
      .sort((a, b) => {
        const tierRank = (tier: DefenderTier | null) => tier === "priority" ? 0 : tier === "medium" ? 1 : 2;
        const aTier = allByChampion.get(a.championId)?.tier ?? null;
        const bTier = allByChampion.get(b.championId)?.tier ?? null;
        const tierDifference = tierRank(aTier) - tierRank(bTier);
        if (tierDifference !== 0) return tierDifference;
        const ratingDifference = (b.assignedTo.rating ?? -1) - (a.assignedTo.rating ?? -1);
        if (ratingDifference !== 0) return ratingDifference;
        return a.championName.localeCompare(b.championName);
      })
      .map(({ _curated: _unused, ...champion }) => champion);
  }

  const additionalPossibleDefenders = buildAdditionalDefenders(
    selectedIds,
    // Legacy overrides only steer the auto-generated plan, not a saved one.
    (championId) => suggestedAssignments ? new Set() : new Set(overrideMap.get(championId)?.blockedUserIds ?? [])
  );

  const countPriority = (memberRows: MemberDefenderRow[]) =>
    memberRows.reduce(
      (count, member) => count + member.defenders.filter((defender) => defender.tier === "priority").length,
      0
    );
  const uniqueChampionsAssigned = selectedIds.size;
  const priorityAssigned = countPriority(suggestedDefenders);
  const mediumAssigned = uniqueChampionsAssigned - priorityAssigned;
  const currentUniqueChampionsAssigned = seenCurrentChampions.size;
  const currentPriorityAssigned = countPriority(currentDefenders);
  const currentMediumAssigned = currentUniqueChampionsAssigned - currentPriorityAssigned;

  const slotUsage = suggestedDefenders.map((member) => ({
    userId: member.userId,
    displayName: member.displayName,
    assigned: member.assigned,
    cap: member.cap
  }));

  return {
    battlegroup,
    memberCount: members.length,
    maxDefenders: members.length * maxDefendersPerMember,
    suggestedDefenders,
    currentDefenders,
    additionalPossibleDefenders,
    uniqueChampionsAssigned,
    priorityAssigned,
    mediumAssigned,
    currentUniqueChampionsAssigned,
    currentPriorityAssigned,
    currentMediumAssigned,
    estimatedDiversityPoints: uniqueChampionsAssigned * POINTS_PER_UNIQUE_DEFENDER,
    pointsPerUniqueDefender: POINTS_PER_UNIQUE_DEFENDER,
    slotUsage
  };
}
