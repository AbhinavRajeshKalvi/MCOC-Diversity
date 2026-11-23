# MCOC War Room server

The Next.js + MongoDB backend and web planner. The Android app signs in against this server and shows the planner pages inside the app, so this has to be deployed before the app works.

## What changed for the Play Store version

- Anyone can create an account (username, email, password) or sign in with Google.
- Accounts belong to an **alliance**. A new player creates one (becoming its Leader) or joins with the 8-character code the Leader or an officer shares. Officers can generate a new code at any time.
- Every plan, roster, war mode and battlegroup is scoped to its alliance. Alliances can't see each other's data.
- Officers can no longer create accounts or reset passwords. Players reset their own password with a 6-digit code emailed to them, and change it from Account.
- Removing a member takes them out of the alliance; it no longer deletes their account.
- Players can leave an alliance or delete their own account (required by Google Play). Public `/privacy` and `/delete-account` pages exist for the Play listing.
- Champions and counters are shared game data. Only officers of your original alliance (and the first account on a brand-new database) can edit them.

### Upgrading the existing database

Nothing to do by hand. On first start the server moves all existing members and plans into one alliance named after `LEGACY_ALLIANCE_NAME` and gives it a join code. Existing logins and roles keep working. The Leader sees the code on the Alliance page.

## Running

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

Deploy on Render exactly as before (`npm install && npm run build`, start `npm start`), and add the new environment variables from `.env.example`.



### Gemini screenshot analysis
The screenshot analyzer uses Gemini 3.6 Flash with `thinkingLevel: "minimal"`. Each screenshot is sent separately. The request timeout is 120 seconds and transient Gemini HTTP errors are retried once. This is intentional because multimodal requests can take longer than ordinary text requests.

## Recent defender-planner updates

- Additional Possible Defenders now contains every available alliance-roster champion, not only the curated medium tier. Automatic selection still uses only the curated Priority/Medium pool.
- Added search/filtering to Additional Possible Defenders.
- Additional defenders remain officer-clickable for manual assignment.
- Assigned defenders can be removed from the plan; removed champions remain available below for manual reassignment.
- Automatic defender allocation now considers every owner of each champion. It maximizes filled defender slots first, then prioritizes Priority defenders and higher PI, allowing lower-PI copies when needed to fill otherwise-unused member capacity.
- Added the current alliance-used defender set to the curated defender pool.
- Fixed the Admin hydration error caused by an interactive champion card containing a nested remove button. Champion cards now use an accessible clickable `<div>` root, allowing embedded controls without invalid nested `<button>` markup.
- Added a persisted Current Defender Diversity snapshot for each Battlegroup.
- Added Suggested / Current tabs on the Battlegroups page.
- Added an officer-only “Replace current with suggested” action that overwrites the current snapshot with the exact suggested defender plan for that Battlegroup.
- Added “Print / Save as PDF” on the Current tab. It opens the browser print dialog with a clean A4-friendly defender list, so officers can choose “Save as PDF”.
- Older databases with no current snapshot are automatically seeded once from the existing suggested plan.

## Alliance and battlegroup chat

The **Chat** page (and the app's Chat tab) has one realtime chat for the whole alliance and one per battlegroup.

- Everyone in the alliance can use the alliance chat. A battlegroup chat is for that battlegroup's members; officers, the Leader and the Admin can use all three. Moving a member to another battlegroup or removing them takes effect straight away (an open connection is cut within a minute).
- Members can remove their own messages; officers can remove anyone's. Deleting an account deletes that member's messages, and deleting an alliance deletes its chats.
- Sending is limited to 15 messages per 20 seconds per member, 1000 characters each.

**How it's realtime.** No extra service is needed. The server streams each open chat to the browser or app as Server-Sent Events (`GET /api/chat/<channel>/stream`), which works on Render's normal web service. To learn about new messages, the server follows a MongoDB change stream on `chatMessages`, so it works even with several server instances. MongoDB Atlas always supports change streams. A plain local `mongod` (not a replica set) doesn't, and then the server relays messages within its own process, which is fine for one server. When a connection drops, the client reconnects and catches up from the last message it had.

API: `GET /api/chat/<channel>` (latest 50, `?before=<id>` for older), `POST /api/chat/<channel>` `{ text }`, `DELETE /api/chat/<channel>/<id>`. Channels are `alliance`, `bg1`, `bg2`, `bg3`.

## Home-screen app and notifications

The site is an installable web app: on Android, Chrome offers **Install app** (or menu > Add to Home screen); on iPhone, Safari's **Share > Add to Home Screen**. It opens full screen with the War Room shield icon. The icons in `public/icons` are drawn by `node scripts/generate-icons.mjs`, and `src/components/BrandMark.tsx` draws the same logo in the app.

**Account > Notifications** has five switches, all off until the member turns them on: chat messages (any chat they can use), node bookings (their battlegroup; officers hear about every battlegroup), node requests (someone asks for a node they booked, or answers their request), roster updates (anyone in the alliance; at most one per member every 30 minutes) and member changes (someone joins, leaves, or is removed; removals say who removed whom, and the removed player is told too). Turning the first one on asks for notification permission on that device. Settings belong to the account; each device that should ring needs its permission granted once (the page offers **Turn on for this device**). iPhones only allow notifications once War Room has been added to the Home Screen and opened from there (iOS 16.4 or later). The Android app's built-in pages can't receive web push.

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (see `.env.example`). Subscriptions are stored in `pushSubscriptions` and the switches in `users.notifications`; both are created as needed, so there is no migration.

## Booking attack nodes (regular wars)

- Officers, the Leader and the Admin drag names from the player list onto the nine paths (any node of a path) and onto nodes 37-50, like the Big Things map. Dragging a name off the map clears it.
- Members see only the map. Tapping one of nodes 37-50 books it, optionally with a champion from their roster. Nodes 1-36 are the paths, which only officers assign.
- Tapping a node someone else booked shows who has it and their champion, and **Ask for this node** (optionally with the champion you'd use). The holder sees the request at the top of the Attack page and in the node, and can **Hand it over** or **Keep it**. A request lapses if the node changes hands some other way.
- Nodes 37-50 (and open requests) clear every 48 hours at 3:00 AM IST, when a new war starts. The first clear is 23 Nov 2026 03:00 IST; the schedule is `src/lib/attack-reset.ts`. There's no cron job: bookings from before the latest clear are removed the next time the map is loaded or changed, so it's on time even if the server was asleep. Paths are not cleared.
- Requests live in `attackTakeoverRequests` (index created on start). Bookings keep the chosen champion in `attackAssignments.championId`.

## Fast launch of the home-screen app

A free Render web service goes to sleep after about 15 minutes without traffic and takes several seconds to wake (the server starts, then connects to MongoDB and runs its start-up work). The installed app used to show a blank dark screen for that whole time.

- The service worker (`public/sw.js`) now races every page open against a 0.6 second timer. If the server hasn't answered, a cached launch screen (`public/splash.html`, logo plus a progress bar) is shown instantly. It stays up until the real page arrives. When the server answers quickly you never see it. Build output under `/_next/static` and the icons are also cached, so repeat opens load faster.
- iPhones show a launch image while a home-screen app starts. They're generated into `public/splash` (`node scripts/generate-icons.mjs`) for current iPhone sizes, so the logo appears instead of black.
- To avoid the wait altogether, keep the server awake: point a free uptime monitor (UptimeRobot, cron-job.org) at `https://<your-domain>/api/health?warm=1` every 5 minutes. `?warm=1` also connects to MongoDB so the first real visit is fast. A paid Render instance never sleeps.

After deploying, installed apps pick up the new service worker the next time they're opened (open the app twice).

## Discord bot

`discord-bot/` is a Discord bot for the alliance's server: war commands (`/bookings`, `/book`, `/request`, `/reset`, `/defense`, `/findchamp`, `/roster`…), announcements for bookings, node requests, reset reminders, roster and member changes, chat watching ("I'll take 41", "anyone have Hercules?") and officer tools (`/setup`, `/settings`, `/roles`, `/warmode`). It runs as its own Render web service on the same database. Members link their Discord account under **Account → Discord**. Setup and deploy steps are in [`discord-bot/README.md`](discord-bot/README.md).
