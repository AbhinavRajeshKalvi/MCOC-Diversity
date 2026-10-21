import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { API_URL } from "@/lib/config";
import { colors, fonts } from "@/lib/theme";
import type { Alliance, User } from "@/lib/types";
import { Body, Button, Field, Label, Message, Panel, Screen, SectionTitle, TextLink } from "@/components/ui";
import { RoleBadge } from "@/components/RoleBadge";

export default function AccountScreen() {
  const { user, alliance, setSession, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!user) return null;
  const dirty = displayName.trim() !== user.displayName || (email.trim() || null) !== user.email;

  async function save() {
    setError(null);
    setNotice(null);
    setBusy("save");
    try {
      const body: Record<string, string> = { displayName: displayName.trim() };
      if (email.trim()) body.email = email.trim();
      const data = await api<{ user: User; alliance: Alliance | null }>("/api/account", { method: "PATCH", body });
      setSession(data.user, data.alliance);
      setNotice("Saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setError(null);
    const ok = await confirm(
      "Delete your account?",
      "Your account and roster are deleted for good. This can't be undone.",
      "Delete",
      true
    );
    if (!ok) return;
    setBusy("delete");
    try {
      await api("/api/account", { method: "DELETE", body: { password: deletePassword } });
      await signOut();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <Panel>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.username}>@{user.username}</Text>
            {alliance && <Text style={styles.alliance}>{alliance.name}</Text>}
          </View>
          {alliance && <RoleBadge role={user.role} />}
        </View>
      </Panel>

      <Message kind="notice">{notice}</Message>
      <Message kind="error">{error}</Message>

      <Panel>
        <SectionTitle>Profile</SectionTitle>
        <Field label="In-game name" value={displayName} onChangeText={setDisplayName} maxLength={60} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
          hint={user.email ? "Used for password reset codes. Never shown to other members." : undefined}
        />
        {!user.email && <Message kind="warning">Add an email so you can reset your password if you forget it.</Message>}
        <Button title="Save" onPress={save} loading={busy === "save"} disabled={!dirty || displayName.trim().length === 0} />
      </Panel>

      <Panel>
        <SectionTitle>Sign-in</SectionTitle>
        <Body>
          {user.googleLinked && user.hasPassword
            ? "You can sign in with Google or with your username and password."
            : user.googleLinked
              ? "You sign in with Google."
              : "You sign in with your username (or email) and password."}
        </Body>
        <Button
          title={user.hasPassword ? "Change password" : "Set a password"}
          icon="key"
          variant="ghost"
          onPress={() => router.push("/set-password")}
        />
        <Button title="Sign out" icon="log-out" variant="ghost" onPress={signOut} />
      </Panel>

      <Panel>
        <SectionTitle>Delete account</SectionTitle>
        <Body>
          Deletes your account and roster and takes you out of your alliance. If you&apos;re the Leader, make someone else Leader
          first.
        </Body>
        {showDelete ? (
          <>
            {user.hasPassword && (
              <Field label="Current password" password value={deletePassword} onChangeText={setDeletePassword} autoComplete="current-password" />
            )}
            <Button
              title="Delete my account"
              icon="trash-2"
              variant="danger"
              onPress={deleteAccount}
              loading={busy === "delete"}
              disabled={user.hasPassword && !deletePassword}
            />
          </>
        ) : (
          <Button title="Delete account…" icon="trash-2" variant="danger" onPress={() => setShowDelete(true)} />
        )}
      </Panel>

      <View style={styles.footer}>
        <TextLink title="Privacy policy" onPress={() => Linking.openURL(`${API_URL}/privacy`)} style={{ fontSize: 13 }} />
        <Label>War Room {Constants.expoConfig?.version ?? ""}</Label>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.parchment, textTransform: "uppercase" },
  username: { fontFamily: fonts.mono, fontSize: 13, color: colors.parchmentFaint, marginTop: 2 },
  alliance: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.brass, marginTop: 6 },
  footer: { alignItems: "center", gap: 8, marginTop: 8 }
});
