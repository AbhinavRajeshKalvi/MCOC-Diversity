# War Room (Android app)

Expo (React Native) app for the MCOC War Room. Sign-in, sign-up, password reset, alliance (create, join by code, members, roles), alliance/battlegroup chat and account screens are native. The Battlegroups, Attack, Counters and Roster tabs show the server's planner pages inside the app, already signed in.

The server URL is `expo.extra.apiUrl` in `app.json` (currently `https://mcoc-diversity.onrender.com`).

## Run it on your phone while developing

```bash
npm install
npx eas build --profile development --platform android   # once; install the APK it gives you
npx expo start                                           # then open the project from that app
```

Google sign-in is a native module, so it doesn't work in Expo Go. Everything else does: `npx expo start` and scan the QR code with Expo Go.

## Build for the Play Store

```bash
npm install -g eas-cli
eas login                      # free Expo account
eas init                       # links the project, writes projectId into app.json
eas build -p android --profile production
```

That produces an `.aab` file. EAS creates and keeps the upload keystore for you; let it.

Other profiles: `preview` builds an installable `.apk` to send to friends for testing.

## Google sign-in (optional)

1. In Google Cloud Console, create an OAuth consent screen, then two OAuth client IDs:
   - **Web application**. Copy its client ID.
   - **Android**, package `com.abhinavrajesh.warroom`, with the SHA-1 from Play Console → *Test and release → App integrity → App signing key certificate*. Add a second Android client with the SHA-1 from `eas credentials` if you also want it in your own test builds.
2. Put the Web client ID in `app.json` → `expo.extra.googleWebClientId`.
3. Put the same Web client ID in the server's `GOOGLE_CLIENT_IDS` environment variable.
4. Rebuild. The "Continue with Google" button appears only when the ID is set.

## Things to know

- The Chat tab follows the server's live chat stream with Expo's streaming `fetch` (React Native has no EventSource). It only stays connected while the tab is open and the app is in the foreground, and catches up on missed messages when you come back. There are no push notifications yet.

- `android.package` (`com.abhinavrajesh.warroom`) can never change after the first upload. Change it now if you want something else.
- Bump `expo.version` in `app.json` for each release you want users to see; the build number goes up automatically.
