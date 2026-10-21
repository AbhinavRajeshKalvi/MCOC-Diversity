import { Platform } from "react-native";
import { GOOGLE_WEB_CLIENT_ID } from "./config";

// Google sign-in uses the native Google Sign-In SDK, so it only works in a real
// build of the app (EAS or `npx expo run:android`), not in Expo Go or on web.
// The module is loaded lazily so the rest of the app still runs without it.

type GoogleModule = typeof import("@react-native-google-signin/google-signin");

let module: GoogleModule | null | undefined;
let configured = false;

function loadModule(): GoogleModule | null {
  if (module !== undefined) return module;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require("@react-native-google-signin/google-signin") as GoogleModule;
  } catch {
    module = null;
  }
  return module;
}

export const googleSignInAvailable = Platform.OS === "android" && Boolean(GOOGLE_WEB_CLIENT_ID);

/** Opens Google's account picker and returns an ID token for the server, or null if the user cancelled. */
export async function getGoogleIdToken(): Promise<string | null> {
  const google = loadModule();
  if (!google || !GOOGLE_WEB_CLIENT_ID) throw new Error("Google sign-in isn't available in this build.");
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = google;
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new Error("Google didn't return a sign-in token. Try again.");
    return response.data.idToken;
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS) return null;
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error("Google Play services is missing or out of date on this phone.");
      }
    }
    throw err instanceof Error ? err : new Error("Google sign-in failed.");
  }
}

/** Forgets the Google account choice so the picker shows next time. */
export async function signOutOfGoogle(): Promise<void> {
  if (!googleSignInAvailable || !configured) return;
  try {
    await loadModule()?.GoogleSignin.signOut();
  } catch {
    // Not signed in with Google; nothing to do.
  }
}
