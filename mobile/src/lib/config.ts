import Constants from "expo-constants";

/**
 * The War Room server the app talks to. Set it in app.json (`expo.extra.apiUrl`)
 * or with EXPO_PUBLIC_API_URL when building, e.g. for a local test server.
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  "https://mcoc-diversity.onrender.com"
).replace(/\/+$/, "");

/**
 * The Google OAuth "Web application" client ID. Google sign-in only shows when
 * it is set (app.json `expo.extra.googleWebClientId` or EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).
 */
export const GOOGLE_WEB_CLIENT_ID: string | null =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  (Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ||
  null;

/** The Play Store listing, included when an officer shares the alliance code. */
export const PLAY_STORE_URL: string | null = Constants.expoConfig?.android?.package
  ? `https://play.google.com/store/apps/details?id=${Constants.expoConfig.android.package}`
  : null;
