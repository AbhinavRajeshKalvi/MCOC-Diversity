import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { api, errorMessage } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";
import { Backdrop, Button } from "./ui";
import { HeaderRight } from "./HeaderButtons";

// Pages that have a native screen in the app instead of a web page.
const NATIVE_ROUTES: Record<string, () => void> = {
  "/alliance": () => router.navigate("/alliance"),
  "/account": () => router.push("/account"),
  "/account/password": () => router.push("/set-password")
};

const API_ORIGIN = new URL(API_URL).origin;

/** Reload the page when the tab comes back into view after this long, so other officers' edits show up. */
const STALE_AFTER_MS = 60_000;

/**
 * Shows one of the website's planner pages (Battlegroups, Attack, Counters,
 * My Roster, Admin) inside the app. It swaps the app's login token for a
 * one-minute handoff token, which the server turns into a web session cookie,
 * and the page hides its own navigation because the app's tabs replace it.
 */
export function PlannerWebView({ path }: { path: string }) {
  const { webViewKey, signOut } = useAuth();
  const navigation = useNavigation();
  const webRef = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const loadedAt = useRef(0);
  const retriedLogin = useRef(false);

  // Fresh handoff on mount, on sign-in/alliance change, and on manual retry.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);
    setUri(null);
    api<{ handoff: string }>("/api/auth/handoff", { method: "POST" })
      .then(({ handoff }) => {
        if (cancelled) return;
        setUri(`${API_URL}/api/auth/handoff?t=${encodeURIComponent(handoff)}&next=${encodeURIComponent(path)}`);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, webViewKey, attempt]);

  const reload = useCallback(() => {
    if (!uri || error) {
      setAttempt((n) => n + 1);
      return;
    }
    setLoading(true);
    if (Platform.OS === "web") setAttempt((n) => n + 1);
    else webRef.current?.reload();
  }, [uri, error]);

  useEffect(() => {
    navigation.setOptions({ headerRight: () => <HeaderRight onReload={reload} /> });
  }, [navigation, reload]);

  useFocusEffect(
    useCallback(() => {
      if (loadedAt.current && Date.now() - loadedAt.current > STALE_AFTER_MS) reload();
    }, [reload])
  );

  function onNavigate(request: WebViewNavigation): boolean {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return false;
    }
    const sameSite = url.origin === API_ORIGIN;
    if (!sameSite) {
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") Linking.openURL(request.url);
      return false;
    }
    if (url.pathname === "/login") {
      // The web session ran out; get a new handoff once, otherwise sign out.
      if (!retriedLogin.current) {
        retriedLogin.current = true;
        setAttempt((n) => n + 1);
      } else {
        signOut();
      }
      return false;
    }
    const native = NATIVE_ROUTES[url.pathname];
    if (native) {
      native();
      return false;
    }
    return true;
  }

  return (
    <View style={styles.fill}>
      {error ? (
        <View style={styles.center}>
          <Backdrop />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try again" icon="refresh-cw" onPress={() => setAttempt((n) => n + 1)} />
        </View>
      ) : uri ? (
        Platform.OS === "web" ? (
          // Only for testing the app in a browser; phones use the native WebView.
          createElement("iframe", {
            key: uri,
            src: uri,
            style: { border: 0, width: "100%", height: "100%", background: colors.ink },
            onLoad: () => {
              loadedAt.current = Date.now();
              setLoading(false);
            }
          })
        ) : (
          <WebView
            ref={webRef}
            source={{ uri }}
            style={styles.web}
            containerStyle={styles.web}
            originWhitelist={["*"]}
            onShouldStartLoadWithRequest={onNavigate}
            onNavigationStateChange={(state) => {
              // Client-side page changes don't go through onShouldStartLoadWithRequest.
              try {
                const url = new URL(state.url);
                const native = url.origin === API_ORIGIN ? NATIVE_ROUTES[url.pathname] : undefined;
                if (native) {
                  webRef.current?.goBack();
                  native();
                }
              } catch {
                // Not a URL we care about.
              }
            }}
            onLoadEnd={() => {
              loadedAt.current = Date.now();
              setLoading(false);
            }}
            onError={(event) => {
              setLoading(false);
              setError(`Couldn't load this page (${event.nativeEvent.description}). Check your connection.`);
            }}
            onRenderProcessGone={() => setAttempt((n) => n + 1)}
            onContentProcessDidTerminate={() => webRef.current?.reload()}
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled={false}
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically={false}
            overScrollMode="never"
            textZoom={100}
            applicationNameForUserAgent="WarRoomApp/1.0"
            webviewDebuggingEnabled={__DEV__}
          />
        )
      ) : null}
      {loading && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={colors.brassBright} size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  web: { flex: 1, backgroundColor: colors.ink },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(13,15,20,0.55)"
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  errorText: { fontFamily: fonts.body, fontSize: 15, color: colors.parchmentDim, textAlign: "center" }
});
