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
