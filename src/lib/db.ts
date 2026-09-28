import { MongoClient, Db, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
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

async function initialize(db: Db): Promise<void> {
  const users = db.collection("users");
  const champions = db.collection("champions");
  const roster = db.collection("rosterEntries");
  const defenderOverrides = db.collection("defenderOverrides");
  const currentDefenderAssignments = db.collection("currentDefenderAssignments");

  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true, collation: CASE_INSENSITIVE }),
    champions.createIndex({ name: 1 }, { unique: true, collation: CASE_INSENSITIVE }),
    roster.createIndex({ userId: 1, championId: 1 }, { unique: true }),
    defenderOverrides.createIndex({ battlegroup: 1, championId: 1 }, { unique: true }),
    currentDefenderAssignments.createIndex({ battlegroup: 1, championId: 1 }, { unique: true })
  ]);

  const existingChampions = await champions
    .find({}, { projection: { name: 1 } })
    .toArray();
  const existingNames = new Set(
    existingChampions.map((champion) => String(champion.name).toLowerCase())
  );
  const missingChampions = SEED_CHAMPIONS
    .filter((name) => !existingNames.has(name.toLowerCase()))
    .map((name) => ({ name, imageUrl: null as string | null }));

  if (missingChampions.length > 0) {
    await champions.insertMany(missingChampions);
    console.log(`Added ${missingChampions.length} new champions to the database.`);
  }

  const userCount = await users.countDocuments();
  if (userCount === 0) {
    const username = process.env.BOOTSTRAP_OFFICER_USERNAME || "officer";
    const password = process.env.BOOTSTRAP_OFFICER_PASSWORD || "12345678";
    await users.insertOne({
      username,
      displayName: "Alliance Officer",
      passwordHash: bcrypt.hashSync(password, 10),
      role: "officer" as const,
      battlegroup: null as 1 | 2 | 3 | null,
      mustChangePassword: true,
      createdAt: new Date()
    });
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
