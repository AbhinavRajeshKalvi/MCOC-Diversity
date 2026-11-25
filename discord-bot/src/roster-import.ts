import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type Attachment,
  type ChatInputCommandInteraction
} from "discord.js";
import { SCREENSHOT_IMPORT_ENABLED } from "../../src/lib/features";
import { analyzeScreenshots } from "../../src/lib/roster-scan/analyze";
import { DRAFT_PARAM, REVIEW_THRESHOLD, ROSTER_PAGE } from "../../src/lib/roster-scan/constants";
import { createDraft } from "../../src/lib/roster-scan/drafts";
import { getReferences } from "../../src/lib/roster-scan/references";
import { UserError, requireActor } from "./actor";
import { appLink } from "./env";
import { BRASS } from "./format";
import { getDb } from "./store";

// /roster-import: read Battle Deck screenshots with the same scanner as the
// web app, then hand the results to the roster page for review. Nothing is
// saved to the roster from Discord; the member confirms in the app.

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const OPTION_NAMES = Array.from({ length: MAX_FILES }, (_, i) => `screenshot${i + 1}`);

export const rosterImportCommand = (() => {
  const b = new SlashCommandBuilder()
    .setName("roster-import")
    .setDescription("Read your roster from Battle Deck screenshots, then review and save it in the app");
  OPTION_NAMES.forEach((name, i) =>
    b.addAttachmentOption((o) =>
      o
        .setName(name)
        .setDescription(i === 0 ? "A Battle Deck screenshot from the game" : "Another Battle Deck screenshot (optional)")
        .setRequired(i === 0)
    )
  );
  return b;
})();

export async function rosterImport(i: ChatInputCommandInteraction) {
  if (!SCREENSHOT_IMPORT_ENABLED) throw new UserError("Screenshot import is switched off in War Room right now.");
  const link = appLink(ROSTER_PAGE);
  if (!link) throw new UserError("The bot doesn't know the War Room app's address yet (APP_URL). Ask whoever runs the bot to set it.");

  // Check the files before doing anything slow, so mistakes come back at once.
  const files = OPTION_NAMES.map((n) => i.options.getAttachment(n)).filter((a): a is Attachment => !!a);
  for (const f of files) {
    const type = (f.contentType ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) throw new UserError(`${f.name} isn't a PNG, JPG or WebP image.`);
    if (f.size > MAX_FILE_BYTES) throw new UserError(`${f.name} is too large. Each screenshot must be 10 MB or smaller.`);
  }

  const actor = await requireActor(i);
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const buffers: Buffer[] = [];
  for (const f of files) {
    const res = await fetch(f.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new UserError(`Couldn't download ${f.name} from Discord. Try again.`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }

  const db = await getDb();
  const { refs, names } = await getReferences(db);
  const result = await analyzeScreenshots(buffers, refs, names);
  const errors = result.errors.map((e) => ({ file: files[e.screenshot]?.name ?? `Screenshot ${e.screenshot + 1}`, error: e.error }));

  if (!result.rows.length) {
    const why = errors.map((e) => `• ${e.file}: ${e.error}`).join("\n") || "No champion cards found.";
    throw new UserError(`Couldn't read any champion cards.\n${why}\n\nUse screenshots of the Battle Deck screen in the game.`);
  }

  const draftId = await createDraft(db, actor.member._id, { rows: result.rows, errors, screenshots: files.length });
  const check = result.rows.filter((r) => r.confidence < REVIEW_THRESHOLD).length;
  const cards = result.rows.length;
  const shots = files.length;

  const embed = new EmbedBuilder()
    .setColor(BRASS)
    .setTitle("Roster screenshots read")
    .setDescription(
      [
        `Read **${cards}** card${cards === 1 ? "" : "s"} from **${shots}** screenshot${shots === 1 ? "" : "s"}. ` +
          (check ? `**${check}** need a check.` : "All look confident."),
        "",
        "Nothing is saved yet. Open the app to check the champions and numbers, then save them to your roster. The link works for 24 hours, only when you're signed in as yourself."
      ].join("\n")
    );
  if (errors.length) {
    embed.addFields({ name: "Couldn't read", value: errors.map((e) => `• ${e.file}: ${e.error}`).join("\n").slice(0, 1024) });
  }

  const url = `${link}?${DRAFT_PARAM}=${encodeURIComponent(draftId)}`;
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Review and save").setURL(url);
  await i.editReply({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)] });
}
