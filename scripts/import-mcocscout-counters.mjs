// Imports counter picks and defender info (class, abilities, immunities) from
// mcocscout.com's published data files into the counters / counterProfiles
// collections used by the Counters page.
//
//   node scripts/import-mcocscout-counters.mjs            (reads MONGODB_URI from .env.local)
//   node scripts/import-mcocscout-counters.mjs --dry-run  (prints what would change)
//
// Safe to re-run: imported rows are tagged source: "mcocscout" and refreshed in
// place. Counters or defender info an officer entered by hand are never overwritten.

import { readFileSync, existsSync } from "node:fs";
import { MongoClient } from "mongodb";

const BASE = "https://mcocscout.com/data";
const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE = "mcocscout";

// mcocscout names that differ from ours beyond accents and punctuation.
const NAME_OVERRIDES = {
  "Hobgoblin": "Hobgoblin (Phil Urich)",
  "Cyclops (New Xavier School)": "Cyclops"
};

function loadEnv() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (!existsSync(".env.local")) throw new Error("Set MONGODB_URI or run from the project folder with .env.local.");
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*MONGODB_URI\s*=\s*(.*)\s*$/);
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("MONGODB_URI is not set in .env.local.");
}

/** "Falcon (Joaquín Torres)" and "Falcon (Joaquin Torres)" -> same key; Ægon -> aegon. */
function nameKey(name) {
  return name
    .replace(/Æ/g, "Ae")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function getJson(file) {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`Couldn't download ${file}: HTTP ${res.status}`);
  return res.json();
}

const CLASSES = new Set(["Cosmic", "Tech", "Mutant", "Skill", "Science", "Mystic"]);

async function main() {
  const [championsFile, countersFile] = await Promise.all([
    getJson("champions.json?schema=encounter-only"),
    getJson("champion_counters.json")
  ]);
  const encounterOnly = new Set(championsFile.encounter_only_ids ?? []);

  const client = await new MongoClient(loadEnv()).connect();
  try {
    const db = client.db();
    const ours = await db.collection("champions").find({}, { projection: { name: 1 } }).toArray();
    const oursByKey = new Map(ours.map((c) => [nameKey(c.name), c._id]));

    // mcocscout champion id -> our champion _id
    const idMap = new Map();
    const unmatched = [];
    for (const champ of championsFile.data) {
      if (encounterOnly.has(champ.id)) continue;
      const candidates = [NAME_OVERRIDES[champ.name], champ.name, champ.alias].filter(Boolean);
      const ourId = candidates.map((n) => oursByKey.get(nameKey(n))).find(Boolean);
      if (ourId) idMap.set(champ.id, ourId);
      else unmatched.push(champ.name);
    }

    // champion_counters.json lists, per attacker (champion_id), the defenders
    // (target_champion_id) it counters. Regroup by defender, keeping file order.
    const byDefender = new Map();
    let skippedPairs = 0;
    for (const row of countersFile.data) {
      const counterId = idMap.get(row.champion_id);
      for (const target of row.counters ?? []) {
        const defenderId = idMap.get(target.target_champion_id);
        if (!counterId || !defenderId || counterId.equals(defenderId)) {
          skippedPairs++;
          continue;
        }
        const key = defenderId.toString();
        if (!byDefender.has(key)) byDefender.set(key, []);
        byDefender.get(key).push({
          defenderId,
          counterId,
          strength: target.effectiveness === "hard" ? "hard" : "soft",
          note: String(target.reason ?? "").trim().slice(0, 500)
        });
      }
    }

    const counters = db.collection("counters");
    const manualPairs = new Set(
      (await counters.find({ source: { $ne: SOURCE } }, { projection: { defenderId: 1, counterId: 1 } }).toArray()).map(
        (c) => `${c.defenderId}:${c.counterId}`
      )
    );

    const counterOps = [];
    const now = new Date();
    for (const list of byDefender.values()) {
      list.forEach((pick, index) => {
        if (manualPairs.has(`${pick.defenderId}:${pick.counterId}`)) return;
        counterOps.push({
          updateOne: {
            filter: { defenderId: pick.defenderId, counterId: pick.counterId },
            update: {
              $set: { strength: pick.strength, note: pick.note, source: SOURCE, updatedAt: now, updatedBy: SOURCE },
              // Imported picks sit after anything officers ranked by hand.
              $setOnInsert: { order: 1000 + index }
            },
            upsert: true
          }
        });
      });
    }

    const profiles = db.collection("counterProfiles");
    const manualProfiles = new Set(
      (await profiles.find({ source: { $ne: SOURCE } }, { projection: { championId: 1 } }).toArray()).map((p) =>
        p.championId.toString()
      )
    );
    const profileOps = [];
    for (const champ of championsFile.data) {
      const championId = idMap.get(champ.id);
      if (!championId || manualProfiles.has(championId.toString())) continue;
      profileOps.push({
        updateOne: {
          filter: { championId },
          update: {
            $set: {
              championId,
              championClass: CLASSES.has(champ.class) ? champ.class : null,
              keyAbilities: (champ.abilities ?? []).map(String),
              immunities: (champ.immunities ?? []).map(String),
              source: SOURCE,
              updatedAt: now,
              updatedBy: SOURCE
            }
          },
          upsert: true
        }
      });
    }

    console.log(`Matched ${idMap.size} mcocscout champions to yours.`);
    if (unmatched.length) console.log(`Not in your champion list (skipped): ${unmatched.join(", ")}`);
    console.log(`Counter picks: ${counterOps.length} for ${byDefender.size} defenders (${skippedPairs} skipped, ${manualPairs.size} hand-entered kept).`);
    console.log(`Defender info: ${profileOps.length} champions.`);

    if (DRY_RUN) {
      console.log("Dry run: nothing written.");
      return;
    }
    if (counterOps.length) {
      const r = await counters.bulkWrite(counterOps, { ordered: false });
      console.log(`Counters: ${r.upsertedCount} added, ${r.modifiedCount} updated.`);
    }
    if (profileOps.length) {
      const r = await profiles.bulkWrite(profileOps, { ordered: false });
      console.log(`Defender info: ${r.upsertedCount} added, ${r.modifiedCount} updated.`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
