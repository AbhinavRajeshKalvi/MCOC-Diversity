import { EmbedBuilder } from "discord.js";
import type { AttackBoard, AttackSlot, AttackerChampion } from "../../src/lib/attack-map";
import { BIG_THINGS_NODES, PATHS, UPPER_NODES, nodeSlot, pathSlot } from "../../src/lib/attack-map";
import { formatIst } from "../../src/lib/attack-reset";
import { WAR_MODE_LABELS, type WarMode } from "../../src/lib/war-mode";
import { appLink } from "./env";

export const BRASS = 0xe0a93b;
export const TEAL = 0x3bb8a8;
export const CRIMSON = 0xd0443c;

export function slotLabel(slot: string): string {
  return slot.startsWith("path-") ? `Path ${slot.slice(5)}` : `Node ${slot.slice(5)}`;
}

export function championLabel(champion: AttackerChampion | null | undefined): string {
  if (!champion) return "";
  const bits = [champion.stars ? `${champion.stars}★` : null, champion.rank ? `R${champion.rank}` : null].filter(Boolean);
  return bits.length ? `${champion.name} (${bits.join(" ")})` : champion.name;
}

/** "<t:...:F> (in 3 hours)" — Discord shows it in each reader's own time zone. */
export function discordTime(date: Date): string {
  const seconds = Math.floor(date.getTime() / 1000);
  return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}

export function resetLine(next: Date): string {
  return `${formatIst(next)} · ${discordTime(next)}`;
}

/** Nodes members can book in this mode. */
export function bookableNodes(mode: WarMode): number[] {
  return mode === "bigThings" ? BIG_THINGS_NODES : UPPER_NODES;
}

export function openNodes(board: AttackBoard, mode: WarMode): number[] {
  return bookableNodes(mode).filter((node) => !board.assignments[nodeSlot(node)]);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One battlegroup's attack map as an embed. */
export function boardEmbed(board: AttackBoard, mode: WarMode): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(BRASS)
    .setTitle(`BG ${board.battlegroup} attack map · ${WAR_MODE_LABELS[mode]}`);
  const link = appLink(`/attack?bg=${board.battlegroup}`);
  if (link) embed.setURL(link);

  if (mode === "regular") {
    const paths = PATHS.map((path) => {
      const holder = board.assignments[pathSlot(path)];
      return `\`${String(path).padStart(2)}\` ${holder ? holder.displayName : "—"}`;
    });
    embed.addFields({ name: "Paths", value: clip(paths.join("\n"), 1024), inline: true });
  }

  const booked = bookableNodes(mode)
    .filter((node) => board.assignments[nodeSlot(node)])
    .map((node) => {
      const slot = nodeSlot(node);
      const holder = board.assignments[slot]!;
      const champion = mode === "regular" ? board.champions?.[slot] : null;
      const attackers = mode === "bigThings" ? board.attackers?.[slot] : null;
      const extra = champion
        ? ` · ${championLabel(champion)}`
        : attackers?.length
          ? ` · ${attackers.map((a) => a.name).join(", ")}`
          : "";
      return `\`${String(node).padStart(2)}\` ${holder.displayName}${extra}`;
    });
  embed.addFields({
    name: mode === "regular" ? "Booked nodes (37-50)" : "Nodes",
    value: clip(booked.join("\n") || "Nothing booked yet.", 1024),
    inline: true
  });

  const open = openNodes(board, mode);
  embed.addFields({ name: `Open (${open.length})`, value: open.length ? open.join(", ") : "Every node is booked." });

  if (board.requests?.length) {
    const lines = board.requests.map(
      (request) =>
        `Node ${request.slot.slice(5)}: ${request.requester.displayName} wants it` +
        (request.champion ? ` (${championLabel(request.champion)})` : "")
    );
    embed.addFields({ name: "Node requests", value: clip(lines.join("\n"), 1024) });
  }
  return embed;
}

export function errorEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(CRIMSON).setDescription(text);
}

export function okEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(TEAL).setDescription(text);
}

export function isSlot(value: string): value is AttackSlot {
  return /^(path|node)-\d+$/.test(value);
}
