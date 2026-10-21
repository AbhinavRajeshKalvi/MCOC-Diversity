import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { PLAY_STORE_URL } from "@/lib/config";
import { useAllianceData } from "@/lib/use-alliance";
import { colors, fonts, radius } from "@/lib/theme";
import { isLeaderOrAbove, isOfficerRole, type Member, type User, type Alliance } from "@/lib/types";
import { Backdrop, Body, Button, Field, Label, Message, Panel, SectionTitle, styles as ui } from "@/components/ui";
import { RoleBadge } from "@/components/RoleBadge";

const GROUPS: { key: 1 | 2 | 3 | null; title: string }[] = [
  { key: 1, title: "Battlegroup 1" },
  { key: 2, title: "Battlegroup 2" },
  { key: 3, title: "Battlegroup 3" },
  { key: null, title: "No battlegroup yet" }
];

const ROLE_ORDER = { admin: 0, leader: 1, officer: 2, member: 3 } as const;

export default function AllianceTab() {
  const { user, setSession } = useAuth();
  const { alliance, members, error, refreshing, refresh, setError } = useAllianceData();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  const officer = isOfficerRole(user?.role);
  const leader = isLeaderOrAbove(user?.role);

  async function run(key: string, action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const shareCode = () =>
    run("share", async () => {
      if (!alliance?.code) return;
      const lines = [
        `Join ${alliance.name} on War Room, our MCOC war planner.`,
        PLAY_STORE_URL ? `1. Get the app: ${PLAY_STORE_URL}` : "1. Install the War Room app.",
        "2. Create an account.",
        `3. Tap "Join an alliance" and enter the code: ${alliance.code}`
      ];
      await Share.share({ message: lines.join("\n") });
    });

  const copyCode = () =>
    run("copy", async () => {
      if (!alliance?.code) return;
      await Clipboard.setStringAsync(alliance.code);
      setNotice("Code copied.");
    });

  const newCode = () =>
    run("code", async () => {
      const ok = await confirm("Make a new code?", "The old code stops working. Members who already joined stay in the alliance.", "New code");
      if (!ok) return;
      await api("/api/alliance/code", { method: "POST" });
      await refresh();
      setNotice("New code ready. Share it with anyone who still needs to join.");
    });

  const saveName = () =>
    run("rename", async () => {
      const data = await api<{ alliance: Alliance }>("/api/alliance", { method: "PATCH", body: { name: name.trim() } });
      if (user) setSession(user, data.alliance);
      await refresh();
      setRenaming(false);
      setNotice("Alliance renamed.");
    });

  const leave = () =>
    run("leave", async () => {
      if (!alliance) return;
      const last = alliance.memberCount <= 1;
      const ok = await confirm(
        last ? "Delete the alliance?" : "Leave the alliance?",
        last
          ? `You're the last member. Leaving deletes ${alliance.name} and all its war plans.`
          : `You'll leave ${alliance.name}. Your roster stays with your account, and you can rejoin with the code.`,
        last ? "Leave and delete" : "Leave",
        true
      );
      if (!ok) return;
      const data = await api<{ user: User; alliance: null }>("/api/alliance/leave", { method: "POST" });
      setSession(data.user, null);
    });

  const sorted = [...(members ?? [])].sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName)
  );

  return (
    <View style={ui.fill}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={ui.screenContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brassBright} colors={[colors.brass]} progressBackgroundColor={colors.panel} />}
      >
        <View style={ui.maxWidth}>
          <Panel>
            {renaming ? (
              <>
                <Field label="Alliance name" value={name} onChangeText={setName} maxLength={40} autoFocus returnKeyType="done" onSubmitEditing={saveName} />
                <View style={styles.row}>
                  <Button title="Save" onPress={saveName} loading={busy === "rename"} disabled={name.trim().length < 2} style={styles.flex} />
                  <Button title="Cancel" variant="ghost" onPress={() => setRenaming(false)} style={styles.flex} />
                </View>
              </>
            ) : (
              <View style={styles.headRow}>
                <View style={styles.flex}>
                  <Text style={styles.allianceName}>{alliance?.name ?? "…"}</Text>
                  <Text style={styles.meta}>
                    {alliance ? `${alliance.memberCount} member${alliance.memberCount === 1 ? "" : "s"}` : ""}
                    {alliance ? ` · ${alliance.warMode === "bigThings" ? "Big Things war" : "Regular war"}` : ""}
                  </Text>
                </View>
                {leader && alliance && (
                  <Pressable
                    onPress={() => {
                      setName(alliance.name);
                      setRenaming(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Rename alliance"
                    hitSlop={10}
                  >
                    <Feather name="edit-2" size={18} color={colors.parchmentFaint} />
                  </Pressable>
                )}
              </View>
            )}

            {officer && alliance?.code && (
              <View style={styles.codeBox}>
                <Label>Join code</Label>
                <Text selectable style={styles.code} accessibilityLabel={`Join code ${alliance.code.split("").join(" ")}`}>
                  {alliance.code}
                </Text>
                <Body style={{ fontSize: 13 }}>Send this to new members. They create an account in the app, then join with the code.</Body>
                <View style={styles.row}>
                  <Button title="Share" icon="share-2" onPress={shareCode} style={styles.flex} />
                  <Button title="Copy" icon="copy" variant="ghost" onPress={copyCode} style={styles.flex} />
                </View>
                {leader && <Button title="Make a new code" icon="refresh-cw" variant="ghost" onPress={newCode} loading={busy === "code"} />}
              </View>
            )}
            {!officer && <Body style={{ fontSize: 13 }}>Ask an officer if you need the alliance code for a friend.</Body>}
          </Panel>

          <Message kind="notice">{notice}</Message>
          <Message kind="error">{error}</Message>

          {officer && (
            <Button title="Member rosters & champion list" icon="sliders" variant="ghost" onPress={() => router.push("/admin")} />
          )}

          {GROUPS.map((group) => {
            const inGroup = sorted.filter((m) => m.battlegroup === group.key);
            if (inGroup.length === 0) return null;
            return (
              <View key={String(group.key)} style={{ gap: 8 }}>
                <View style={styles.groupHead}>
                  <SectionTitle>{group.title}</SectionTitle>
                  <Text style={styles.count}>{group.key ? `${inGroup.length}/10` : inGroup.length}</Text>
                </View>
                <View style={styles.list}>
                  {inGroup.map((member, i) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isMe={member.id === user?.id}
                      last={i === inGroup.length - 1}
                      onPress={officer ? () => router.push({ pathname: "/member/[id]", params: { id: member.id } }) : undefined}
                    />
                  ))}
                </View>
              </View>
            );
          })}
          {officer && <Body style={{ fontSize: 13, textAlign: "center" }}>Tap a member to change their role or battlegroup.</Body>}

          <Button title="Leave alliance" icon="log-out" variant="danger" onPress={leave} loading={busy === "leave"} style={{ marginTop: 8 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function MemberRow({ member, isMe, last, onPress }: { member: Member; isMe: boolean; last: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [styles.memberRow, !last && styles.memberBorder, pressed && { backgroundColor: "rgba(255,255,255,0.04)" }]}
    >
      <View style={styles.flex}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.displayName}
          {isMe ? <Text style={styles.me}>  (you)</Text> : null}
        </Text>
        <Text style={styles.memberUser} numberOfLines={1}>
          @{member.username}
        </Text>
      </View>
      <RoleBadge role={member.role} />
      {onPress && <Feather name="chevron-right" size={18} color={colors.parchmentFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: 10 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  allianceName: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.parchment, textTransform: "uppercase", letterSpacing: 1 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.parchmentFaint, marginTop: 2 },
  codeBox: { gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  code: { fontFamily: fonts.mono, fontSize: 32, letterSpacing: 6, color: colors.brassBright, fontWeight: "700" },
  groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  count: { fontFamily: fonts.mono, fontSize: 13, color: colors.parchmentFaint },
  list: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, overflow: "hidden" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  memberBorder: { borderBottomWidth: 1, borderBottomColor: "rgba(47,51,63,0.6)" },
  memberName: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.parchment },
  me: { fontFamily: fonts.body, fontSize: 12, color: colors.parchmentFaint },
  memberUser: { fontFamily: fonts.mono, fontSize: 12, color: colors.parchmentFaint, marginTop: 2 }
});
