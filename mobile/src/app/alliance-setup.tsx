import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";
import type { Alliance, User } from "@/lib/types";
import { Body, Brand, Button, Divider, Field, Message, Panel, Screen, SectionTitle, TextLink } from "@/components/ui";

// New accounts land here: join an alliance with the code the Leader sent, or
// create one and become its Leader.
export default function AllianceSetupScreen() {
  const { user, setSession, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"join" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "join" | "create") {
    setError(null);
    setBusy(kind);
    try {
      const data =
        kind === "join"
          ? await api<{ user: User; alliance: Alliance }>("/api/alliances/join", { body: { code } })
          : await api<{ user: User; alliance: Alliance }>("/api/alliances", { body: { name: name.trim() } });
      setSession(data.user, data.alliance);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Screen centered>
      <Brand subtitle={`Welcome, ${user?.displayName ?? ""}`} />
      <Message kind="error">{error}</Message>
      <Panel>
        <SectionTitle>Join an alliance</SectionTitle>
        <Body>Enter the code your alliance Leader or an officer sent you.</Body>
        <Field
          label="Alliance code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          placeholder="ABCD2345"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => code.length >= 4 && run("join")}
          style={{ fontFamily: fonts.mono, fontSize: 22, letterSpacing: 5, color: colors.brassBright }}
        />
        <Button title="Join alliance" icon="users" onPress={() => run("join")} loading={busy === "join"} disabled={code.length < 4 || busy === "create"} />
      </Panel>
      <Divider label="or" />
      <Panel>
        <SectionTitle>Create an alliance</SectionTitle>
        <Body>You&apos;ll be its Leader and get a code to share with your members.</Body>
        <Field label="Alliance name" value={name} onChangeText={setName} maxLength={40} returnKeyType="go" onSubmitEditing={() => name.trim().length >= 2 && run("create")} />
        <Button
          title="Create alliance"
          icon="plus"
          variant="ghost"
          onPress={() => run("create")}
          loading={busy === "create"}
          disabled={name.trim().length < 2 || busy === "join"}
        />
      </Panel>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 4 }}>
        <TextLink title="Account" onPress={() => router.push("/account")} />
        <TextLink title="Sign out" onPress={signOut} style={{ color: colors.crimsonBright }} />
      </View>
    </Screen>
  );
}
