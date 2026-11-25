# War Room Discord bot

A Discord bot for the War Room planner. It shares the app's database and the
app's own booking code, so the rules are the same in Discord and in the app.

**What it does**

- **War commands**: `/bookings`, `/book`, `/unbook`, `/mynodes`, `/node`,
  `/request`, `/reset`, `/defense`, `/findchamp`, `/counter`, `/warmode`, `/help`.
- **Find a champion**: `/findchamp Solvarch` lists every Solvarch on the
  alliance's rosters with stars, rank, sig and battlegroup, strongest first.
  Add `bg:` (or type `!findchamp solvarch bg1`) for one battlegroup only.
- **See a roster**: `/roster user:@someone` (or `member:` with their in-game
  name) sends a picture of their rank 4 and higher champions: portraits grouped
  by rank (R5, then R4), each with rank, ascension, sig level and PI. Add `all:True` (or
  `!roster @someone all`) for the whole roster. `!roster @someone` or `!roster <name>` works in chat too.
- **Counter Finder**: `/counter boss:Onslaught nodes:Incinerate on hit, Shock on contact`
  ranks your roster for a fight, the same way as the app's Counter Finder page:
  immunity to what the boss and nodes inflict first, then class advantage, how
  well the champion matches up, and how built-up your copy is. The reply shows
  the top 8 with score, ★/rank/sig/PI and the main reasons, marks guessed data
  with ⚠️ (medium) or ⚠️⚠️ (low), and links to the full list in the app (when
  `APP_URL` is set). `boss` and `nodes` autocomplete; for several nodes, pick
  one, type a comma, then pick the next. Add `all:True` to rank every champion.
  Without a linked account (or with an empty roster) it ranks every champion
  and says why. The champion data lives in `src/data/counters/` and corrections
  saved on the app's Counter Data page apply here within a minute.
- **Announcements** in a channel you pick: nodes booked, freed or handed over,
  node requests (the holder gets a DM with *Hand it over* / *Keep it* buttons),
  reminders before the attack reset with each battlegroup's open nodes, the
  new war cycle, roster updates, and members joining, leaving or changing
  battlegroup.
- **Chat watching**: when someone writes *"I'll take 41 and 44"* the bot
  offers a button to book them (or to ask the holder). When someone asks
  *"anyone have Hercules?"* it lists who in the alliance has that champion. It
  never books anything unless the person presses the button.
- **Officer tools**: `/setup` links the server to your alliance, `/settings`
  picks channels, reminder times and which announcements are on, `/roles`
  gives Discord roles (War Officer, BG 1, BG 2, BG 3) from War Room roles and
  battlegroups, `/warmode set` switches the war mode, and `/book` or `/unbook`
  with the `member` option act for anyone.
- **Moderation**: `/purge count:20` deletes the last 20 messages people wrote in
  the channel (bot messages and pins are kept). Add `user:` for one person's
  messages, or `include_bots:True`. Needs Manage Messages, for you and the bot.
  Discord can't bulk delete messages older than 14 days.

Bookings, requests and answers made from Discord also send the app's usual
push notifications, if you give the bot the same VAPID keys as the app.

## How members link their account

1. In War Room open **Account → Discord → Link Discord**. A 6-letter code
   shows (valid 10 minutes).
2. In the alliance's Discord server, type `/link` and paste the code.

From then on the bot knows who they are, their battlegroup and their role.
`/unlink` (or *Unlink Discord* in the app) undoes it.

## 1. Create the bot in the Discord developer portal (free)

1. Go to <https://discord.com/developers/applications> → **New Application**,
   name it (e.g. *War Room*).
2. **Bot** page:
   - **Reset Token** and copy it. This is `DISCORD_TOKEN`. Keep it secret.
   - Under **Privileged Gateway Intents** turn on **Message Content Intent**
     (needed for chat watching). Presence and Server Members are not needed.
   - You can turn off **Public Bot** so only you can add it to servers.
3. **Installation** (or **OAuth2 → URL Generator**): scopes `bot` and
   `applications.commands`. Bot permissions: View Channels, Send Messages,
   Embed Links, Attach Files, Read Message History, Manage Messages (only for
   `/purge`) and Manage Roles (only for `/roles`).
   Or use this link with your application id:

   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=bot%20applications.commands&permissions=268561408
   ```

4. Open the link, pick your alliance's server, and authorize.

## 2. Run it on your computer (optional, for testing)

```bash
cd discord-bot
npm install
cp .env.example .env      # then fill in DISCORD_TOKEN and MONGODB_URI
npm run dev
```

Set `DISCORD_DEV_GUILD_ID` to your server's id while testing so new commands
show up straight away. Leave it empty in production.

## 3. Deploy on Render (separate web service)

The bot is its own Render **Web Service** from the same GitHub repo as the app.
It uses files from the app's `src/lib`, so leave **Root Directory** empty and
run the commands inside `discord-bot`:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root Directory | *(empty)* |
| Build Command | `cd discord-bot && npm install` |
| Start Command | `cd discord-bot && npm start` |
| Health Check Path | `/health` |
| Instance type | Free |

**Environment variables**

| Key | Value |
| --- | --- |
| `DISCORD_TOKEN` | the bot token from step 1 |
| `MONGODB_URI` | the **same** connection string as the app |
| `APP_URL` | your app's address, e.g. `https://your-war-room.onrender.com` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, copy from the app so Discord actions send push notifications |
| `NODE_VERSION` | `20` or newer (optional) |

Under **Settings → Build Filters** you can add `discord-bot/**` and `src/lib/**`
to *Included Paths* so app-only changes don't redeploy the bot.

**Keep it awake**: a free web service sleeps after 15 minutes without web
traffic, and a sleeping bot is offline in Discord. Point a free cron ping
(e.g. cron-job.org or UptimeRobot) at
`https://<your-bot>.onrender.com/health` every 10 minutes. It answers with
JSON like `{"ok":true,"discord":"connected",...}`.

> Render's free plan gives 750 instance hours a month per workspace, shared
> by all free services. The app and the bot both awake all month need about
> 1,490 hours, so one of them would be suspended near the end of the month.
> Put the bot in its own Render workspace (or a paid instance) to avoid that.

## 4. Set it up in your server

1. Link your own account (`/link`), as above.
2. As an officer with **Manage Server**, run `/setup` in the channel where
   announcements should go (or pass `channel:`).
3. Optional:
   - `/roles create` makes War Officer and BG roles and keeps them in sync.
     Drag the bot's role **above** those roles in Server Settings → Roles.
     `/roles map` uses roles you already have.
   - `/settings bg-channel` gives a battlegroup its own channel.
   - `/settings kind-channel` sends one kind of announcement to its own
     channel, for every battlegroup or (with `bg`) just one. For example
     `/settings kind-channel kind:Roster updates bg:BG 1 channel:#bg1-roster`
     and `/settings kind-channel kind:Node bookings bg:BG 1 channel:#bg1-bookings`.
     Node requests and reset reminders follow the bookings channel unless you
     give them their own. Leave out `channel` to undo. `/settings show` lists
     where each kind goes.
   - `/settings reminders hours:6, 2` changes reminder times (default 2h).
   - `/settings announce` turns single announcement kinds on or off.
   - `/settings smart-watch on:false` turns chat watching off.
4. Ask everyone to link their account.

## How it works

- It connects to Discord over a websocket and checks the database every
  `POLL_SECONDS` (default 20) for changes, comparing with the previous check.
  The first check after a start only takes a snapshot, so a restart never
  floods the channel.
- Its data sits in the app's database: `discordGuilds` (server settings),
  `discordLinks` and `discordLinkCodes` (account links).
- Slash commands are registered on every start.
- `start.cjs` lets the shared files in `../src/lib` find their packages in
  this folder's `node_modules` and runs TypeScript with `tsx`, so there's no
  build step. `npm run typecheck` checks the types.
