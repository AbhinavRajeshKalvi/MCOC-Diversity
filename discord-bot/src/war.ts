import type { Db } from "mongodb";
import { isValidSlot, nodeSlot, type AttackSlot } from "../../src/lib/attack-map";
import {
  answerTakeover,
  loadAttackBoard,
  requestTakeover,
  setAttackSlot,
  type TakeoverAnswer
} from "../../src/lib/attack-plans";
import { notifyAllianceMembers, notifyMembers } from "../../src/lib/push";
import { getWarMode } from "../../src/lib/war-settings";
import type { WarMode } from "../../src/lib/war-mode";
import { UserError, type Actor } from "./actor";
import { bookableNodes, championLabel } from "./format";
import { ObjectId } from "./store";

// War actions taken from Discord. They go through the app's own functions, so
// the same rules apply as in the app, and send the same push notifications.

export function checkNode(node: number, mode: WarMode): AttackSlot {
  const slot = nodeSlot(node);
  if (!isValidSlot(slot, mode) || !bookableNodes(mode).includes(node)) {
    const range = mode === "bigThings" ? "1-10 (Big Things map)" : "37-50";
    throw new UserError(`Node ${node} can't be booked. Members book nodes ${range}.`);
  }
  return slot;
}

function toId(id: string | null | undefined): ObjectId | null {
  if (!id) return null;
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

/** Books a node for the actor, or (officers) for another member. */
export async function bookNode(
  db: Db,
  actor: Actor,
  {
    battlegroup,
    node,
    forUserId,
    championId,
    replace = false
  }: { battlegroup: 1 | 2 | 3; node: number; forUserId: string | null; championId: string | null; replace?: boolean }
) {
  const mode = await getWarMode(db, actor.allianceId);
  const slot = checkNode(node, mode);
  const userId = forUserId ?? String(actor.member._id);
  if (forUserId && !toId(forUserId)) throw new UserError("Pick a member from the list.");
  if (championId && !toId(championId)) throw new UserError("Pick a champion from the list.");
  if (championId && mode !== "regular") throw new UserError("Champions are only picked on the regular map.");

  // Officers can put anyone anywhere in the app, so the shared code lets them
  // overwrite a booking. From Discord that only happens when asked for.
  const current = (await loadAttackBoard(db, actor.allianceId, battlegroup, mode)).assignments[slot];
  if (current && current.userId !== userId && !(actor.isOfficer && replace)) {
    throw new UserError(
      `Node ${node} in BG ${battlegroup} is already booked by **${current.displayName}**. ` +
        (actor.isOfficer
          ? "Add `replace:True` to take it off them, or use `/request` to ask for it."
          : "Use `/request` to ask them for it.")
    );
  }

  const result = await setAttackSlot(db, {
    allianceId: actor.allianceId,
    mode,
    battlegroup,
    slot,
    userId,
    championId,
    actorId: String(actor.member._id),
    actorIsOfficer: actor.isOfficer
  });
  if (!result.ok) throw new UserError(result.error.replace("Tap it to ask them for it.", "Use `/request` to ask them for it."));

  const board = await loadAttackBoard(db, actor.allianceId, battlegroup, mode);
  const holder = board.members.find((member) => member.userId === userId);
  const champion = board.champions?.[slot];
  if (result.booked) {
    const name = holder?.displayName ?? "Someone";
    const what =
      userId === String(actor.member._id) ? `${name} booked node ${node}` : `${actor.member.displayName} put ${name} on node ${node}`;
    notifyAllianceMembers(
      db,
      "booking",
      {
        allianceId: actor.allianceId,
        exclude: [String(actor.member._id), userId],
        filter: { $or: [{ battlegroup }, { role: { $in: ["officer", "leader", "admin"] } }] }
      },
      {
        title: `Node ${node} booked · BG ${battlegroup}`,
        body: `${what}${champion ? ` with ${champion.name}` : ""}.`,
        url: `/attack?bg=${battlegroup}`,
        tag: `booking-${battlegroup}-${slot}`
      }
    );
  }
  return { mode, holderName: holder?.displayName ?? "you", champion: championLabel(champion) };
}

/** Leaves a node (or, for officers, clears anyone off it). */
export async function unbookNode(db: Db, actor: Actor, { battlegroup, node }: { battlegroup: 1 | 2 | 3; node: number }) {
  const mode = await getWarMode(db, actor.allianceId);
  const slot = checkNode(node, mode);
  const before = await loadAttackBoard(db, actor.allianceId, battlegroup, mode);
  const holder = before.assignments[slot];
  if (!holder) throw new UserError(`Nobody has booked node ${node} in BG ${battlegroup}.`);
  if (!actor.isOfficer && holder.userId !== String(actor.member._id)) {
    throw new UserError(`Node ${node} is booked by ${holder.displayName}, not you.`);
  }
  const result = await setAttackSlot(db, {
    allianceId: actor.allianceId,
    mode,
    battlegroup,
    slot,
    userId: null,
    actorId: String(actor.member._id),
    actorIsOfficer: actor.isOfficer
  });
  if (!result.ok) throw new UserError(result.error);
  return { holderName: holder.displayName };
}

/** Asks the holder of a booked node to hand it over. */
export async function askForNode(
  db: Db,
  actor: Actor,
  { node, championId }: { node: number; championId: string | null }
) {
  const battlegroup = actor.member.battlegroup;
  if (!battlegroup) throw new UserError("You're not in a battlegroup.");
  const mode = await getWarMode(db, actor.allianceId);
  if (mode !== "regular") throw new UserError("Node requests are only for the regular map.");
  const slot = checkNode(node, mode);
  if (championId && !toId(championId)) throw new UserError("Pick a champion from the list.");
  const result = await requestTakeover(db, {
    allianceId: actor.allianceId,
    battlegroup,
    slot,
    actorId: String(actor.member._id),
    championId
  });
  if (!result.ok) throw new UserError(result.error);

  const board = await loadAttackBoard(db, actor.allianceId, battlegroup, "regular");
  const request = board.requests?.find((r) => r.slot === slot && r.requester.userId === String(actor.member._id));
  notifyMembers(db, "takeover", [result.holderId], {
    title: `${actor.member.displayName} wants node ${node}`,
    body: request?.champion
      ? `They'd use ${request.champion.name}. Open the map to hand it over or keep it.`
      : "Open the map to hand it over or keep it.",
    url: `/attack?bg=${battlegroup}&node=${node}`,
    tag: `takeover-${battlegroup}-${slot}`
  });
  const holder = board.assignments[slot];
  return { holderName: holder?.displayName ?? "the holder" };
}

/** Accept, decline or withdraw a node request. */
export async function answerRequest(db: Db, actor: Actor, requestId: string, answer: TakeoverAnswer) {
  const id = toId(requestId);
  if (!id) throw new UserError("That request isn't valid any more.");
  const result = await answerTakeover(db, {
    allianceId: actor.allianceId,
    requestId: id,
    answer,
    actorId: String(actor.member._id)
  });
  if (!result.ok) throw new UserError(result.error);
  const node = result.slot.slice(5);
  if (answer !== "cancel") {
    notifyMembers(db, "takeover", [result.requesterId], {
      title: answer === "accept" ? `Node ${node} is yours` : `Node ${node} request declined`,
      body:
        answer === "accept"
          ? `${actor.member.displayName} handed node ${node} over to you.`
          : `${actor.member.displayName} is keeping node ${node}.`,
      url: `/attack?bg=${result.battlegroup}&node=${node}`,
      tag: `takeover-${result.battlegroup}-${result.slot}`
    });
  }
  return { ...result, node };
}
