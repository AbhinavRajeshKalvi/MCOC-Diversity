import type { Db } from "mongodb";
import type { ObjectId } from "./db";
import { notifyAllianceMembers, notifyMembers } from "./push";

// "Member changes" notifications: someone joins, leaves, or is removed.

const URL = "/alliance";

export function notifyMemberJoined(db: Db, allianceId: ObjectId, member: { id: ObjectId; name: string }) {
  notifyAllianceMembers(
    db,
    "members",
    { allianceId, exclude: [member.id] },
    { title: "New member", body: `${member.name} joined the alliance.`, url: URL, tag: `members-${String(member.id)}` }
  );
}

export function notifyMemberLeft(db: Db, allianceId: ObjectId, member: { id: ObjectId; name: string }) {
  notifyAllianceMembers(
    db,
    "members",
    { allianceId, exclude: [member.id] },
    { title: "Member left", body: `${member.name} left the alliance.`, url: URL, tag: `members-${String(member.id)}` }
  );
}

/** Tells the alliance who removed whom, and tells the removed player too. */
export function notifyMemberRemoved(
  db: Db,
  allianceId: ObjectId,
  {
    member,
    by,
    allianceName
  }: { member: { id: ObjectId; name: string }; by: { id: string; name: string }; allianceName: string }
) {
  notifyAllianceMembers(
    db,
    "members",
    { allianceId, exclude: [member.id, by.id] },
    {
      title: "Member removed",
      body: `${by.name} removed ${member.name} from the alliance.`,
      url: URL,
      tag: `members-${String(member.id)}`
    }
  );
  notifyMembers(db, "members", [member.id], {
    title: "Removed from alliance",
    body: `${by.name} removed you from ${allianceName}.`,
    url: URL,
    tag: `members-${String(member.id)}`
  });
}
