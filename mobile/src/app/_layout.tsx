import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";
import { isOfficerRole } from "@/lib/types";
import { OfflineScreen } from "@/components/OfflineScreen";
import { Loading } from "@/components/ui";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/**
 * Which screens exist depends on where the member is: signed out, stuck on a
 * default password, not in an alliance yet, or ready to plan.
 */
function RootNavigator() {
  const { status, user, alliance } = useAuth();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  if (status === "loading") return <Loading message="Connecting to War Room…" />;
  if (status === "offline") return <OfflineScreen />;

  const signedIn = Boolean(user);
  const needsPassword = Boolean(user?.mustChangePassword);
  const ready = signedIn && !needsPassword;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ink },
        headerStyle: { backgroundColor: colors.panel },
        headerTintColor: colors.parchment,
        headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 22 },
        headerShadowVisible: false,
        animation: "fade"
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsPassword}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>
      <Stack.Protected guard={ready && !alliance}>
        <Stack.Screen name="alliance-setup" />
      </Stack.Protected>
      <Stack.Protected guard={ready && Boolean(alliance)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="member/[id]" options={{ headerShown: true, title: "Member", animation: "slide_from_right" }} />
      </Stack.Protected>
      {/* Only officers and above have an Admin screen at all. */}
      <Stack.Protected guard={ready && Boolean(alliance) && isOfficerRole(user?.role)}>
        <Stack.Screen name="admin" options={{ headerShown: true, title: "Admin", animation: "slide_from_right" }} />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="account" options={{ headerShown: true, title: "Account", animation: "slide_from_right" }} />
        <Stack.Screen name="set-password" options={{ headerShown: true, title: "Password", animation: "slide_from_right" }} />
      </Stack.Protected>
    </Stack>
  );
}
