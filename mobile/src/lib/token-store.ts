import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// The login token lives in the device keystore (SecureStore). The web build,
// used only for local testing, falls back to localStorage.
const KEY = "warroom.session";

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (token) globalThis.localStorage?.setItem(KEY, token);
      else globalThis.localStorage?.removeItem(KEY);
    } catch {
      // Storage blocked: the session just won't survive a reload.
    }
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
