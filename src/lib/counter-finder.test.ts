import { describe, expect, it } from "vitest";
import {
  classMatchup,
  findCounters,
  slugify,
  type ChampionData,
  type FinderData,
  type RosterEntry
} from "./counter-finder";
import { BASE_RAW, loadFinderData, mergeRaw, buildFinderData, validateData } from "./counter-finder-data";
import { SEED_CHAMPIONS } from "./seed-champions";

const data = loadFinderData();

function champ(name: string, extra: Partial<ChampionData> = {}): ChampionData {
  return {
    id: slugify(name),
    name,
    class: "Skill",
    immunities: [],
    resistances: {},
    traits: [],
    inflicts: [],
    confidence: "high",
    ...extra
  };
}

/** Real effects/nodes/bosses, with a controlled champion list. */
function withChampions(champions: ChampionData[]): FinderData {
  return { ...data, champions };
}

function owned(name: string, extra: Partial<RosterEntry> = {}): RosterEntry {
  return { championId: slugify(name), stars: 7, rank: 3, sigLevel: 200, rating: 20000, ascended: 0, awakened: true, ...extra };
}

describe("data files", () => {
  it("have no broken references", () => {
    expect(validateData(data)).toEqual([]);
  });

  it("only use champion names that exist in the app's champion list", () => {
    const seed = new Set(SEED_CHAMPIONS.map(slugify));
    const unknown = data.champions.filter((c) => !seed.has(c.id)).map((c) => c.name);
    expect(unknown).toEqual([]);
  });

  it("slugify joins names the way the roster does", () => {
    expect(slugify("Jack O'Lantern")).toBe("jack-o-lantern");
    expect(slugify("Ægon")).toBe("aegon");
    expect(slugify("Falcon (Joaquín Torres)")).toBe("falcon-joaquin-torres");
  });
});

describe("class matchup", () => {
  it("follows the class wheel", () => {
    expect(classMatchup("Tech", "Mutant")).toBe(1);
    expect(classMatchup("Mutant", "Tech")).toBe(-1);
    expect(classMatchup("Mystic", "Cosmic")).toBe(1);
    expect(classMatchup("Skill", "Skill")).toBe(0);
  });
});

describe("findCounters", () => {
  it("Onslaught alone ranks Techs and power-control counters high", () => {
    const results = findCounters(data, { bossId: "onslaught", nodeIds: [], effectIds: [] }, [], { onlyRoster: false });
    const top = results.slice(0, 10);
    for (const r of top) {
      const champion = data.champions.find((c) => c.id === r.championId)!;
      const techOrPowerControl = champion.class === "Tech" || champion.traits.includes("power-control");
      const listed = r.reasons.some((x) => x.text.startsWith("Listed as a strong counter"));
      expect(techOrPowerControl || listed, `${r.name} in Onslaught top 10`).toBe(true);
    }
    expect(top.map((r) => r.championId)).toContain("bastion");
    const tech = results.find((r) => r.championId === "vision")!;
    expect(tech.reasons.map((r) => r.text)).toContain("Tech advantage vs Mutant");
    expect(tech.reasons.some((r) => r.text.startsWith("Power control helps vs Onslaught"))).toBe(true);
  });

  it("Onslaught + Incinerate + Shock: immune to both > immune to one > immune to neither", () => {
    const fixture = withChampions([
      champ("Neither", { class: "Tech", traits: ["power-control"] }),
      champ("One", { class: "Tech", traits: ["power-control"], immunities: ["incinerate"] }),
      champ("Both", { class: "Tech", traits: ["power-control"], immunities: ["incinerate", "shock"] })
    ]);
    const results = findCounters(
      fixture,
      { bossId: "onslaught", nodeIds: ["incinerate-on-hit", "shock-on-contact"], effectIds: [] },
      [],
      { onlyRoster: false }
    );
    expect(results.map((r) => r.name)).toEqual(["Both", "One", "Neither"]);
    expect(results[0]!.reasons.map((r) => r.text)).toContain(
      "Immune to Incinerate and Shock (every effect in this fight)"
    );
    expect(results[1]!.reasons.map((r) => r.text)).toContain("Immune to Incinerate");
    expect(results[1]!.reasons.map((r) => r.text)).toContain("Not immune to Shock");
    expect(results[2]!.reasons.map((r) => r.text)).toContain("Not immune to Incinerate and Shock");
  });

  it("full immunity outranks a better matchup with no immunity", () => {
    const fixture = withChampions([
      champ("Matchup Only", { class: "Tech", traits: ["power-control", "high-burst"] }),
      champ("Immune Decent", { class: "Skill", immunities: ["incinerate", "shock"] })
    ]);
    const results = findCounters(
      fixture,
      { bossId: "onslaught", nodeIds: ["incinerate-on-hit", "shock-on-contact"], effectIds: [] },
      [],
      { onlyRoster: false }
    );
    expect(results[0]!.name).toBe("Immune Decent");
  });

  it("counts partial resistance below full immunity", () => {
    const fixture = withChampions([
      champ("Resists", { resistances: { incinerate: 60 } }),
      champ("Immune", { immunities: ["incinerate"] }),
      champ("Nothing")
    ]);
    const results = findCounters(fixture, { bossId: null, nodeIds: [], effectIds: ["incinerate"] }, [], {
      onlyRoster: false
    });
    expect(results.map((r) => r.name)).toEqual(["Immune", "Resists", "Nothing"]);
    expect(results[1]!.reasons.map((r) => r.text)).toContain("Resists Incinerate (~60%)");
  });

  it("only my roster returns just owned champions, with their stats", () => {
    const roster = [owned("Bastion"), owned("Human Torch", { rank: 1, stars: 6 })];
    const results = findCounters(data, { bossId: "onslaught", nodeIds: [], effectIds: [] }, roster, {
      onlyRoster: true
    });
    expect(results.map((r) => r.championId).sort()).toEqual(["bastion", "human-torch"]);
    expect(results.every((r) => r.owned)).toBe(true);
    expect(results.find((r) => r.championId === "bastion")!.breakdown.roster).toBeGreaterThan(
      results.find((r) => r.championId === "human-torch")!.breakdown.roster
    );

    const all = findCounters(data, { bossId: "onslaught", nodeIds: [], effectIds: [] }, roster, { onlyRoster: false });
    expect(all.length).toBeGreaterThan(results.length);
    expect(all.find((r) => r.championId === "vision")!.reasons.map((r) => r.text)).toContain("Not in your roster");
  });

  it("roster strength breaks ties between otherwise equal champions", () => {
    const fixture = withChampions([champ("Low"), champ("High")]);
    const roster = [owned("Low", { stars: 6, rank: 2, sigLevel: 0, rating: 9000 }), owned("High")];
    const results = findCounters(fixture, { bossId: null, nodeIds: [], effectIds: ["bleed"] }, roster, {
      onlyRoster: true
    });
    expect(results.map((r) => r.name)).toEqual(["High", "Low"]);
  });

  it("penalises damage types the boss is immune to", () => {
    const fixture = withChampions([
      champ("Bleeder", { class: "Cosmic", inflicts: ["bleed"] }),
      champ("Puncher", { class: "Cosmic" })
    ]);
    const results = findCounters(fixture, { bossId: "ultron", nodeIds: [], effectIds: [] }, [], { onlyRoster: false });
    expect(results.map((r) => r.name)).toEqual(["Puncher", "Bleeder"]);
    expect(results[1]!.reasons.map((r) => r.text)).toContain("Damage type Bleed blocked by boss immunity");
  });

  it("node-granted immunity also blocks damage types", () => {
    const fixture = withChampions([champ("Bleeder", { inflicts: ["bleed"] })]);
    const [result] = findCounters(
      fixture,
      { bossId: null, nodeIds: ["defender-immune-to-bleed"], effectIds: [] },
      [],
      { onlyRoster: false }
    );
    expect(result!.reasons.map((r) => r.text)).toContain("Damage type Bleed blocked by boss immunity");
  });

  it("uses alliance officer counters for the chosen defender", () => {
    const fixture = withChampions([champ("Plain"), champ("Officer Pick")]);
    const results = findCounters(fixture, { bossId: "onslaught", nodeIds: [], effectIds: [] }, [], {
      onlyRoster: false,
      officerCounters: [{ defenderId: "onslaught", counterId: "officer-pick", strength: "hard" }]
    });
    expect(results[0]!.name).toBe("Officer Pick");
  });

  it("flags low-confidence data", () => {
    const fixture = withChampions([champ("Sure", { confidence: "high" }), champ("Guess", { confidence: "low" })]);
    const results = findCounters(fixture, { bossId: null, nodeIds: ["incinerate-on-hit"], effectIds: [] }, [], {
      onlyRoster: false
    });
    expect(results.find((r) => r.name === "Sure")!.confidence).toBe("high");
    expect(results.find((r) => r.name === "Guess")!.confidence).toBe("low");
  });

  it("doesn't list the defender as its own counter, and includes roster champions without data", () => {
    const results = findCounters(
      data,
      { bossId: "human-torch", nodeIds: [], effectIds: [] },
      [owned("Brand New Champ")],
      { onlyRoster: false, extraChampions: [{ id: "brand-new-champ", name: "Brand New Champ" }] }
    );
    expect(results.some((r) => r.championId === "human-torch")).toBe(false);
    const fresh = results.find((r) => r.championId === "brand-new-champ")!;
    expect(fresh.hasData).toBe(false);
    expect(fresh.confidence).toBe("low");
  });
});

describe("overrides", () => {
  it("replace, add and hide entries", () => {
    const merged = buildFinderData(
      mergeRaw(BASE_RAW, [
        { kind: "champion", id: "bastion", data: { name: "Bastion", class: "Tech", immunities: ["shock"], confidence: "high" }, deleted: false },
        { kind: "boss", id: "my-boss", data: { name: "My Boss", class: "Skill" }, deleted: false },
        { kind: "node", id: "plasma", data: null, deleted: true }
      ])
    );
    const bastion = merged.champions.find((c) => c.id === "bastion")!;
    expect(bastion.immunities).toEqual(["shock"]);
    expect(bastion.confidence).toBe("high");
    expect(merged.bosses.some((b) => b.id === "my-boss")).toBe(true);
    expect(merged.nodes.some((n) => n.id === "plasma")).toBe(false);
    expect(merged.champions.length).toBe(data.champions.length);
  });
});
