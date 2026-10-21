import { randomInt } from "crypto";
import { MongoClient, Db, ObjectId } from "mongodb";
import { SEED_CHAMPIONS } from "./seed-champions";

declare global {
  // eslint-disable-next-line no-var
  var __mcocMongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var __mcocDbReady: Promise<Db> | undefined;
}

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and set your MongoDB connection string."
    );
  }
  return uri;
}

async function connect(): Promise<MongoClient> {
  if (!globalThis.__mcocMongoClientPromise) {
    const client = new MongoClient(getUri(), {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 30000
    });

    globalThis.__mcocMongoClientPromise = client.connect().catch(async (error) => {
      // Do not cache a rejected connection promise. A transient Atlas/network
      // failure should be recoverable on the next request.
      globalThis.__mcocMongoClientPromise = undefined;
      try {
        await client.close();
      } catch {
        // Ignore cleanup errors; preserve the original connection error.
      }
      throw error;
    });
  }
  return globalThis.__mcocMongoClientPromise;
}

const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;

/** Names of champions an officer removed, so the startup seed doesn't re-add them. */
export const REMOVED_CHAMPIONS = "removedChampions";

/** Case-insensitive key for a champion name in REMOVED_CHAMPIONS. */
export function championKey(name: string): string {
  return name.trim().toLowerCase();
}

// Collections holding one alliance's battlegroup plans. Each document carries
// the alliance's id so alliances never see each other's plans.
export const ALLIANCE_SCOPED_COLLECTIONS = [
  "defenderOverrides",
  "suggestedDefenderAssignments",
  "currentDefenderAssignments",
  "bigThingsSuggestedDefenderAssignments",
  "bigThingsCurrentDefenderAssignments",
  "defenderPlanState",
  "attackAssignments",
  "bigThingsAttackAssignments",
  "bigThingsDefenderNodes",
  "chatMessages"
] as const;

async function dropIndexIfExists(db: Db, collection: string, name: string) {
  try {
    await db.collection(collection).dropIndex(name);
  } catch {
    // Missing index or collection: nothing to drop.
  }
}

/**
 * Databases from before alliances existed hold a single alliance's data with
 * no alliance id. Put all of it into one alliance so it keeps working, and
 * let that alliance's officers keep editing the shared champion and counter
 * data. Runs once; later starts find nothing to move.
 */
async function migrateToAlliances(db: Db): Promise<void> {
  const users = db.collection("users");
  const legacyUsers = await users.countDocuments({ allianceId: { $exists: false } });
  if (legacyUsers === 0) return;

  // Old single-alliance unique indexes would clash with per-alliance ones.
  await Promise.all([
    dropIndexIfExists(db, "users", "single_leader"),
    dropIndexIfExists(db, "users", "single_admin"),
    dropIndexIfExists(db, "defenderOverrides", "battlegroup_1_championId_1"),
    dropIndexIfExists(db, "currentDefenderAssignments", "battlegroup_1_championId_1"),
    dropIndexIfExists(db, "bigThingsCurrentDefenderAssignments", "battlegroup_1_championId_1"),
    dropIndexIfExists(db, "attackAssignments", "battlegroup_1_slot_1"),
    dropIndexIfExists(db, "bigThingsAttackAssignments", "battlegroup_1_slot_1"),
    dropIndexIfExists(db, "bigThingsDefenderNodes", "battlegroup_1_node_1"),
    dropIndexIfExists(db, "bigThingsDefenderNodes", "battlegroup_1_userId_1")
  ]);

  const warModeDoc = await db.collection<{ _id: string; mode?: string }>("allianceSettings").findOne({ _id: "warMode" });
  const now = new Date();
  await db.collection("alliances").updateOne(
    { legacy: true },
    {
      $setOnInsert: {
        legacy: true,
        name: process.env.LEGACY_ALLIANCE_NAME?.trim() || "My Alliance",
        code: generateAllianceCode(),
        warMode: warModeDoc?.mode === "bigThings" ? "bigThings" : "regular",
        createdAt: now
      }
    },
    { upsert: true }
  );
  const alliance = await db.collection("alliances").findOne({ legacy: true }, { projection: { _id: 1 } });
  const allianceId = alliance!._id;

  await users.updateMany(
    { allianceId: { $exists: false }, role: { $in: ["admin", "leader", "officer"] } },
    { $set: { gameDataEditor: true } }
  );
  await users.updateMany({ allianceId: { $exists: false } }, { $set: { allianceId } });
  for (const name of ALLIANCE_SCOPED_COLLECTIONS) {
    await db.collection(name).updateMany({ allianceId: { $exists: false } }, { $set: { allianceId } });
  }
  console.log(`Moved ${legacyUsers} existing members into the alliance ${String(allianceId)}.`);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

/** A random 8-character alliance join code, easy to read out and type. */
export function generateAllianceCode(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

async function initialize(db: Db): Promise<void> {
  const users = db.collection("users");
  const champions = db.collection("champions");
  const roster = db.collection("rosterEntries");
  const counters = db.collection("counters");
  const counterProfiles = db.collection("counterProfiles");

  await migrateToAlliances(db);

  const byAllianceBg = { allianceId: 1, battlegroup: 1 } as const;
  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE }),
    users.createIndex(
      { email: 1 },
      { name: "unique_email", unique: true, partialFilterExpression: { email: { $type: "string" } } }
    ),
    users.createIndex(
      { googleId: 1 },
      { name: "unique_google", unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
    ),
    users.createIndex(byAllianceBg),
    // At most one Leader and one Admin per alliance. Different key directions
    // keep them separate indexes.
    users.createIndex(
      { allianceId: 1, role: 1 },
      { name: "alliance_single_leader", unique: true, partialFilterExpression: { role: "leader" } }
    ),
    users.createIndex(
      { allianceId: -1, role: -1 },
      { name: "alliance_single_admin", unique: true, partialFilterExpression: { role: "admin" } }
    ),
    db.collection("alliances").createIndex({ code: 1 }, { unique: true }),
    db.collection("passwordResets").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("passwordResets").createIndex({ userId: 1 }),
    champions.createIndex({ name: 1 }, { unique: true, collation: CASE_INSENSITIVE }),
    roster.createIndex({ userId: 1, championId: 1 }, { unique: true }),
    db.collection("defenderOverrides").createIndex({ ...byAllianceBg, championId: 1 }, { unique: true }),
    db.collection("currentDefenderAssignments").createIndex({ ...byAllianceBg, championId: 1 }, { unique: true }),
    db.collection("bigThingsCurrentDefenderAssignments").createIndex({ ...byAllianceBg, championId: 1 }, { unique: true }),
    db.collection("suggestedDefenderAssignments").createIndex(byAllianceBg),
    db.collection("bigThingsSuggestedDefenderAssignments").createIndex(byAllianceBg),
    db.collection("defenderPlanState").createIndex(byAllianceBg),
    counters.createIndex({ defenderId: 1, counterId: 1 }, { unique: true }),
    counters.createIndex({ counterId: 1 }),
    counterProfiles.createIndex({ championId: 1 }, { unique: true }),
    // One member per attack path or upper-island node, per battlegroup.
    db.collection("attackAssignments").createIndex({ ...byAllianceBg, slot: 1 }, { unique: true }),
    db.collection("bigThingsAttackAssignments").createIndex({ ...byAllianceBg, slot: 1 }, { unique: true }),
    // Big Things defender placement: one member per node, one node per member.
    db.collection("bigThingsDefenderNodes").createIndex({ ...byAllianceBg, node: 1 }, { unique: true }),
    db.collection("bigThingsDefenderNodes").createIndex({ ...byAllianceBg, userId: 1 }, { unique: true }),
    // Alliance and battlegroup chat, read newest first.
    db.collection("chatMessages").createIndex({ allianceId: 1, channel: 1, _id: -1 }),
    db.collection("chatMessages").createIndex({ userId: 1 })
  ]);

  const existingChampions = await champions
    .find({}, { projection: { name: 1 } })
    .toArray();
  const existingNames = new Set(
    existingChampions.map((champion) => String(champion.name).toLowerCase())
  );
  // Champions an editor deleted stay deleted; otherwise every restart or
  // redeploy would add them back from the seed list.
  const removedNames = new Set(
    (await db.collection(REMOVED_CHAMPIONS).find({}, { projection: { key: 1 } }).toArray()).map((doc) =>
      String(doc.key)
    )
  );
  const missingChampions = SEED_CHAMPIONS
    .filter((name) => !existingNames.has(name.toLowerCase()) && !removedNames.has(championKey(name)))
    .map((name) => ({ name, imageUrl: null as string | null }));

  if (missingChampions.length > 0) {
    await champions.insertMany(missingChampions);
    console.log(`Added ${missingChampions.length} new champions to the database.`);
  }
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  const db = client.db();
  if (!globalThis.__mcocDbReady) {
    globalThis.__mcocDbReady = initialize(db)
      .then(() => db)
      .catch((error) => {
        // Initialization can fail because Atlas is temporarily unreachable.
        // Clear the cached promise so a later request can retry initialization.
        globalThis.__mcocDbReady = undefined;
        throw error;
      });
  }
  await globalThis.__mcocDbReady;
  return db;
}

export { ObjectId };

/** Parses a string into a Mongo ObjectId, returning null instead of throwing on bad input. */
export function toObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}
