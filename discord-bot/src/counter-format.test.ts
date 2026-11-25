import { describe, expect, it } from "vitest";
import { loadFinderData } from "../../src/lib/counter-finder-data";
import { slugify, type RosterEntry } from "../../src/lib/counter-finder";
import { bossChoices, buildCounterReply, finderPath, nodeChoices, parseNodes, resolveTarget } from "./counter-format";

const data = loadFinderData();

const own = (name: string, extra: Partial<RosterEntry> = {}): RosterEntry => ({
  championId: slugify(name),
  stars: 7,
  rank: 3,
  sigLevel: 120,
  rating: 21500,
  ascended: 0,
  awakened: true,
  ...extra
});

describe("/counter input", () => {
  it("finds bosses and champions from typed text or ids", () => {
    expect(resolveTarget(data, "onslaught")?.id).toBe("onslaught");
    expect(resolveTarget(data, "Onsla")?.id).toBe("onslaught");
    expect(resolveTarget(data, "human torch")?.id).toBe("human-torch");
    expect(resolveTarget(data, "nobody at all")).toBeNull();
  });

  it("parses comma-separated nodes by id or name and reports unknown ones", () => {
    expect(parseNodes(data, "incinerate-on-hit, Shock on contact, banana")).toEqual({
      nodeIds: ["incinerate-on-hit", "shock-on-contact"],
      unknown: ["banana"]
    });
    expect(parseNodes(data, "shock, shock").nodeIds).toEqual(["shock-on-contact"]);
    expect(parseNodes(data, null)).toEqual({ nodeIds: [], unknown: [] });
  });

  it("boss autocomplete puts boss profiles first and stays within Discord's limits", () => {
    const choices = bossChoices(data, "ons");
    expect(choices[0]).toEqual({ name: "Onslaught (boss)", value: "onslaught" });
    expect(bossChoices(data, "").length).toBeLessThanOrEqual(25);
  });

  it("node autocomplete keeps earlier picks and adds one more", () => {
    const choices = nodeChoices(data, "incinerate-on-hit, sho");
    expect(choices[0]).toEqual({ name: "Incinerate on hit, Shock on contact", value: "incinerate-on-hit,shock-on-contact" });
    expect(choices.every((c) => c.value.length <= 100 && c.name.length <= 100)).toBe(true);
    expect(nodeChoices(data, "").length).toBeLessThanOrEqual(25);
  });

  it("links to the web finder", () => {
    expect(finderPath("onslaught", ["incinerate-on-hit", "shock-on-contact"], false)).toBe(
      "/counters/finder?boss=onslaught&nodes=incinerate-on-hit%2Cshock-on-contact"
    );
    expect(finderPath("ultron", [], true)).toBe("/counters/finder?boss=ultron&all=1");
  });
});

describe("/counter reply", () => {
  const roster = [own("Bastion"), own("Electro", { stars: 6, rank: 5, sigLevel: 200 }), own("Black Panther")];

  it("ranks the member's roster with stats, reasons and confidence marks", () => {
    const { embed, results } = buildCounterReply({
      data,
      bossId: "onslaught",
      nodeIds: ["incinerate-on-hit", "shock-on-contact"],
      roster,
      options: {},
      useRoster: true,
      allReason: null,
      unknownNodes: [],
      link: "https://example.test/counters/finder?boss=onslaught"
    });
    expect(results.map((r) => r.championId)).toEqual(["bastion", "electro", "black-panther"]);
    expect(embed.title).toBe("Counters vs Onslaught");
    expect(embed.url).toBe("https://example.test/counters/finder?boss=onslaught");
    expect(embed.description).toContain("Onslaught** (Mutant) + Incinerate on hit and Shock on contact");
    expect(embed.description).toContain("Ranking **your roster** (3 champions)");
    expect(embed.description).toContain("low confidence");
    expect(embed.fields[0]!.name).toMatch(/^#1 Bastion · \d+ ⚠️⚠️$/);
    expect(embed.fields[0]!.value).toContain("Tech · ★7 R3 S120 PI 21,500");
    expect(embed.fields[1]!.value).toContain("✅ Immune to Shock");
    expect(embed.fields[1]!.value).toContain("❌ Not immune to Incinerate");
  });

  it("says why it ranks all champions, and caps the list", () => {
    const { embed, results } = buildCounterReply({
      data,
      bossId: "onslaught",
      nodeIds: [],
      roster: [],
      options: {},
      useRoster: false,
      allReason: "Your Discord isn't linked to War Room.",
      unknownNodes: ["banana"],
      link: null
    });
    expect(results.length).toBeGreaterThan(100);
    expect(embed.fields).toHaveLength(8);
    expect(embed.description).toContain("Ranking **all champions**. Your Discord isn't linked to War Room.");
    expect(embed.description).toContain("Ignored (no matching node): banana");
    expect(embed.url).toBeUndefined();
    expect(embed.footer!.text).toContain(`${results.length - 8} more`);
  });

  it("stays inside Discord's embed size limits", () => {
    const { embed } = buildCounterReply({
      data,
      bossId: "onslaught",
      nodeIds: data.nodes.map((n) => n.id).slice(0, 12),
      roster: [],
      options: {},
      useRoster: false,
      allReason: "x",
      unknownNodes: [],
      link: null
    });
    const total =
      embed.title.length +
      embed.description.length +
      (embed.footer?.text.length ?? 0) +
      embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(embed.fields.every((f) => f.value.length <= 1024 && f.name.length <= 256)).toBe(true);
  });
});
