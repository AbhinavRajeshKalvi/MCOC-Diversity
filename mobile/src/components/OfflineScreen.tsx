import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/auth";
import { Body, Brand, Button, Screen } from "./ui";

/** Shown when the app has a saved sign-in but can't reach the server on start-up. */
export function OfflineScreen() {
  const { refresh, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);
  return (
    <Screen centered>
      <Brand />
      <Body style={{ textAlign: "center" }}>
        Couldn&apos;t reach the War Room server. Check your connection. If the server was asleep it can take up to a minute
        to wake up.
      </Body>
      <View style={{ gap: 10 }}>
        <Button
          title="Try again"
          icon="refresh-cw"
          loading={retrying}
          onPress={async () => {
            setRetrying(true);
            await refresh();
            setRetrying(false);
          }}
        />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
