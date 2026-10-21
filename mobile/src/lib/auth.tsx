import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError, api, setApiToken, setUnauthorizedHandler } from "./api";
import { loadToken, saveToken } from "./token-store";
import { signOutOfGoogle } from "./google";
import type { Alliance, LoginResult, User } from "./types";

type Status = "loading" | "offline" | "ready";

type AuthState = {
  status: Status;
  user: User | null;
  alliance: Alliance | null;
  /** Stores the token from sign-in, sign-up, password reset or Google sign-in. */
  completeLogin: (result: LoginResult) => Promise<void>;
  /** Re-reads the member and alliance from the server (role, alliance and war mode can change). */
  refresh: () => Promise<void>;
  /** Updates the cached member/alliance after an API call that returned them. */
  setSession: (user: User, alliance: Alliance | null) => void;
  signOut: () => Promise<void>;
  /** Bumped whenever the planner web views should reload (sign-in, alliance change). */
  webViewKey: number;
  reloadWebViews: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const tokenRef = useRef<string | null>(null);

  const clear = useCallback(async () => {
    tokenRef.current = null;
    setApiToken(null);
    setUser(null);
    setAlliance(null);
    await saveToken(null);
  }, []);

  const load = useCallback(async () => {
    if (!tokenRef.current) {
      setStatus("ready");
      return;
    }
    try {
      const me = await api<{ user: User; alliance: Alliance | null }>("/api/me");
      setUser(me.user);
      setAlliance(me.alliance);
      setStatus("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clear();
        setStatus("ready");
      } else if (err instanceof ApiError && err.status === 403) {
        // A default password still needs changing; /api/me is allowed, so this is rare.
        setStatus("ready");
      } else {
        setStatus("offline");
      }
    }
  }, [clear]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const token = await loadToken().catch(() => null);
      tokenRef.current = token;
      setApiToken(token);
      await load();
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear, load]);

  // Pick up changes made elsewhere (new role, removed from alliance, war mode)
  // when the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && tokenRef.current) load();
    });
    return () => sub.remove();
  }, [load]);

  const completeLogin = useCallback(async (result: LoginResult) => {
    tokenRef.current = result.token;
    setApiToken(result.token);
    await saveToken(result.token);
    setUser(result.user);
    setAlliance(result.alliance);
    setWebViewKey((k) => k + 1);
    setStatus("ready");
  }, []);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const setSession = useCallback(
    (nextUser: User, nextAlliance: Alliance | null) => {
      if (alliance?.id !== nextAlliance?.id) setWebViewKey((k) => k + 1);
      setUser(nextUser);
      setAlliance(nextAlliance);
    },
    [alliance?.id]
  );

  const signOut = useCallback(async () => {
    api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await signOutOfGoogle();
    await clear();
    setWebViewKey((k) => k + 1);
  }, [clear]);

  const reloadWebViews = useCallback(() => setWebViewKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ status, user, alliance, completeLogin, refresh, setSession, signOut, webViewKey, reloadWebViews }),
    [status, user, alliance, completeLogin, refresh, setSession, signOut, webViewKey, reloadWebViews]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
