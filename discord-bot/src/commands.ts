import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import { ANNOUNCE_KINDS } from "./store";

// Slash command definitions. Handlers are in handlers.ts.

const bgOption = (o: any, description = "Battlegroup (defaults to yours)") =>
  o.setName("bg").setDescription(description).addChoices(
    { name: "BG 1", value: 1 },
    { name: "BG 2", value: 2 },
    { name: "BG 3", value: 3 }
  );

const nodeOption = (o: any) => o.setName("node").setDescription("Node number").setRequired(true).setMinValue(1).setMaxValue(50);

export const COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("What the War Room bot can do"),

  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Discord account to your War Room account")
    .addStringOption((o) =>
      o.setName("code").setDescription("The code from War Room → Account → Discord").setRequired(true).setMaxLength(12)
    ),

  new SlashCommandBuilder().setName("unlink").setDescription("Unlink your Discord account from War Room"),

  new SlashCommandBuilder()
    .setName("bookings")
    .setDescription("Who booked which nodes, and which are still open")
    .addIntegerOption((o) => bgOption(o, "Battlegroup (defaults to yours; officers see all three)")),

  new SlashCommandBuilder()
    .setName("book")
    .setDescription("Book an attack node")
    .addIntegerOption(nodeOption)
    .addStringOption((o) =>
      o.setName("champion").setDescription("The champion you'll use (regular map, nodes 37-50)").setAutocomplete(true)
    )
    .addStringOption((o) => o.setName("member").setDescription("Officers: book it for this member").setAutocomplete(true))
    .addIntegerOption((o) => bgOption(o)),

  new SlashCommandBuilder()
    .setName("unbook")
    .setDescription("Give up a node you booked (officers: clear anyone's)")
    .addIntegerOption(nodeOption)
    .addIntegerOption((o) => bgOption(o)),

  new SlashCommandBuilder().setName("mynodes").setDescription("Your booked nodes and node requests"),

  new SlashCommandBuilder()
    .setName("node")
    .setDescription("Who has a node, and who's asking for it")
    .addIntegerOption(nodeOption)
    .addIntegerOption((o) => bgOption(o)),

  new SlashCommandBuilder()
    .setName("request")
    .setDescription("Ask the member who booked a node to hand it over")
    .addIntegerOption(nodeOption)
    .addStringOption((o) => o.setName("champion").setDescription("The champion you'd use there").setAutocomplete(true)),

  new SlashCommandBuilder().setName("reset").setDescription("When nodes 37-50 clear for the next war"),

  new SlashCommandBuilder()
    .setName("defense")
    .setDescription("The battlegroup's current defender plan")
    .addIntegerOption((o) => bgOption(o)),

  new SlashCommandBuilder()
    .setName("findchamp")
    .setDescription("Every copy of a champion on the alliance's rosters")
    .addStringOption((o) => o.setName("champion").setDescription("Champion").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => bgOption(o, "Only this battlegroup's players (leave out for the whole alliance)")),

  new SlashCommandBuilder()
    .setName("roster")
    .setDescription("Someone's whole roster (leave both options out for your own)")
    .addUserOption((o) => o.setName("user").setDescription("Their Discord account (they need to have linked it)"))
    .addStringOption((o) => o.setName("member").setDescription("Or pick their in-game name").setAutocomplete(true))
    .addBooleanOption((o) => o.setName("all").setDescription("Show every champion, not just rank 4 and up")),

  new SlashCommandBuilder()
    .setName("warmode")
    .setDescription("Show the war mode, or (officers) switch it")
    .addStringOption((o) =>
      o
        .setName("set")
        .setDescription("Switch to")
        .addChoices({ name: "Regular", value: "regular" }, { name: "Big Things", value: "bigThings" })
    ),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Officers: link this Discord server to your alliance")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Where announcements go (defaults to this channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Officers: bot settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("show").setDescription("Show the current settings"))
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Where announcements go")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("bg-channel")
        .setDescription("A separate channel for one battlegroup's bookings and reminders")
        .addIntegerOption((o) => bgOption(o, "Battlegroup").setRequired(true))
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel (leave out to use the main one)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("kind-channel")
        .setDescription("Send one kind of announcement (e.g. roster updates) to its own channel")
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("What")
            .setRequired(true)
            .addChoices(...ANNOUNCE_KINDS.map(({ kind, label }) => ({ name: label, value: kind })))
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel (leave out to stop using a separate one)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addIntegerOption((o) => bgOption(o, "Only for this battlegroup (leave out for all)"))
    )
    .addSubcommand((s) =>
      s
        .setName("announce")
        .setDescription("Turn one kind of announcement on or off")
        .addStringOption((o) =>
          o
            .setName("kind")
            .setDescription("What")
            .setRequired(true)
            .addChoices(...ANNOUNCE_KINDS.map(({ kind, label }) => ({ name: label, value: kind })))
        )
        .addBooleanOption((o) => o.setName("on").setDescription("On or off").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("reminders")
        .setDescription("Hours before the attack reset to post a reminder")
        .addStringOption((o) =>
          o.setName("hours").setDescription('Comma-separated, e.g. "6, 2". "off" for none.').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("smart-watch")
        .setDescription('Reply to chat like "I\'ll take 41" or "anyone have Hercules?"')
        .addBooleanOption((o) => o.setName("on").setDescription("On or off").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Officers: give Discord roles from War Room roles and battlegroups")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("create").setDescription("Create War Officer, BG 1, BG 2 and BG 3 roles and turn syncing on"))
    .addSubcommand((s) =>
      s
        .setName("map")
        .setDescription("Use roles you already have")
        .addRoleOption((o) => o.setName("officer").setDescription("Role for officers, Leader and Admin"))
        .addRoleOption((o) => o.setName("bg1").setDescription("Role for BG 1"))
        .addRoleOption((o) => o.setName("bg2").setDescription("Role for BG 2"))
        .addRoleOption((o) => o.setName("bg3").setDescription("Role for BG 3"))
    )
    .addSubcommand((s) => s.setName("sync").setDescription("Update everyone's roles now"))
    .addSubcommand((s) => s.setName("off").setDescription("Stop syncing roles (roles already given stay)"))
].map((builder) => builder.toJSON());
