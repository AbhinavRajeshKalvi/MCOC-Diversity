import http from "http";
import { Client, Events, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import { COMMANDS } from "./commands";
import { env } from "./env";
import { handleInteraction } from "./handlers";
import { handleMessage } from "./smart";
import { getDb, initStore } from "./store";
import { startWatcher } from "./watcher";

const startedAt = Date.now();

async function registerCommands(applicationId: string) {
  const rest = new REST().setToken(env.token);
  if (env.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, env.devGuildId), { body: COMMANDS });
    console.log(`Registered ${COMMANDS.length} commands in server ${env.devGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body: COMMANDS });
    console.log(`Registered ${COMMANDS.length} commands for every server.`);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Privileged: turn on "Message Content Intent" in the developer portal (Bot page).
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag} in ${ready.guilds.cache.size} server(s).`);
  try {
    await registerCommands(ready.application.id);
  } catch (err) {
    console.error("Couldn't register slash commands:", err);
  }
  if (env.registerOnly) {
    await client.destroy();
    process.exit(0);
  }
  startWatcher(client);
});

client.on(Events.InteractionCreate, (interaction) => void handleInteraction(client, interaction));
client.on(Events.MessageCreate, (message) =>
  void handleMessage(message).catch((err) => console.error("[chat]", err))
);
client.on(Events.Error, (err) => console.error("[discord]", err));
client.on(Events.ShardDisconnect, () => console.warn("[discord] disconnected; reconnecting…"));
client.on(Events.ShardResume, () => console.log("[discord] reconnected."));

// A tiny web server so Render sees a web service, and so a cron ping keeps the
// free instance awake. GET /health answers with the bot's status.
function startHealthServer() {
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    if (path !== "/" && path !== "/health" && path !== "/healthz") {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const body = JSON.stringify({
      ok: true,
      discord: client.isReady() ? "connected" : "connecting",
      servers: client.guilds.cache.size,
      ping: client.ws.ping,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000)
    });
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(req.method === "HEAD" ? undefined : body);
  });
  server.listen(env.port, () => console.log(`Health check on port ${env.port} (GET /health).`));
}

async function main() {
  if (!env.registerOnly) startHealthServer();
  const db = await getDb();
  await initStore(db);
  await client.login(env.token);
}

main().catch((err) => {
  console.error("The bot couldn't start:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => console.error("[unhandled]", err));
