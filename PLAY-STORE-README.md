# MCOC War Room: Play Store package

```
server/   Next.js web app + API (deploy to Render, replaces the current GitHub version)
mobile/   Expo React Native Android app (build with EAS, upload to Play)
play-store-assets/  512px icon and 1024x500 feature graphic for the listing
```

## 1. Deploy the server first

1. Put `server/` into your GitHub repo (it's your existing MCOC-Diversity code plus the changes) and let Render deploy it.
2. In Render → Environment, add the new variables from `server/.env.example`:
   - `LEGACY_ALLIANCE_NAME`: what your current alliance should be called.
   - `RESEND_API_KEY` and `EMAIL_FROM`: so "Forgot password" emails arrive. Sign up at resend.com, verify a domain (or use `onboarding@resend.dev` while testing, which only sends to your own email).
   - `NEXT_PUBLIC_CONTACT_EMAIL`: shown on the privacy and delete-account pages.
   - `GOOGLE_CLIENT_IDS`: only if you set up Google sign-in (see `mobile/README.md`).
3. On first start the server moves everyone into your alliance automatically. Log in as the Leader/Admin and open **Alliance** to see the join code.

Existing members keep their usernames and passwords. They should add an email under **Account** so they can reset their own password later.

## 2. Build the app

See `mobile/README.md`. Short version:

```bash
cd mobile
npm install
npx eas-cli login
npx eas-cli init
npx eas-cli build -p android --profile production
```

Download the `.aab` from the link EAS prints.

## 3. Publish on Google Play

1. Create a Play Console developer account (one-time $25).
2. **Create app** → name "War Room for MCOC" (or similar; avoid using "Marvel" as if official), Free, App.
3. **Test and release → Internal testing** → create release → upload the `.aab`. Add your own email as a tester and install it from the opt-in link.
4. Fill in **App content**:
   - Privacy policy: `https://mcoc-diversity.onrender.com/privacy`
   - App access: "All or some functionality is restricted", and give reviewers a username/password for a test account that is in an alliance.
   - Ads: No.
   - Data safety: collects **email address**, **user IDs** (username), and **other user-generated content** (rosters, plans). Purpose: App functionality and Account management. Encrypted in transit: Yes. Users can request deletion: Yes. Data not shared with third parties.
   - Delete account URL: `https://mcoc-diversity.onrender.com/delete-account`
   - Content rating questionnaire, target audience (13+ is a safe choice), and news app: No.
5. **Store listing**: upload `play-store-assets/play-icon-512.png`, the feature graphic, and at least 2 phone screenshots (take them from the app on your phone).
6. New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before Google lets you publish to Production. Your alliance mates are the obvious testers.
7. Then promote the release to Production.

For each update: bump `version` in `mobile/app.json`, build again, upload a new release.

## What's not in the app (yet)

- **Print / Save as PDF** on the Battlegroups page opens the browser print dialog, which doesn't exist inside the app. It still works on the website.
- **Roster screenshot import** is still locked, same as on the website.
- Champion and counter data is shared by all alliances, so only your original alliance's officers can edit it. Other alliances can read it but not change it.
- Apple App Store isn't set up, though the Expo app could be built for iOS later.
- The free Render plan sleeps when idle, so the first open after a while can take ~30-50 seconds. The app shows a retry screen if the server doesn't answer. A paid Render instance avoids this.
