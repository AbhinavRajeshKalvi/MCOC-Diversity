import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { useAllianceData } from "@/lib/use-alliance";
import { colors, fonts } from "@/lib/theme";
import { isLeaderOrAbove, type Member, type Role } from "@/lib/types";
import { Body, Button, Label, Loading, Message, Panel, Screen } from "@/components/ui";
import { RoleBadge } from "@/components/RoleBadge";
import { Segmented } from "@/components/Segmented";

// Officers change a member's role and battlegroup, or remove them from the
// alliance. The rules mirror the server's (see the server's /api/users/[id]).
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, refresh: refreshMe } = useAuth();
  const { members, error, setError, reload } = useAllianceData();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!members || !user) return <Loading />;
  const member = members.find((m) => m.id === id);
  if (!member) {
    return (
      <Screen edges={["bottom"]}>
        <Message kind="error">{error ?? "This member is no longer in your alliance."}</Message>
        <Button title="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const viewerIsAdmin = user.role === "admin";
  const viewerIsLeader = isLeaderOrAbove(user.role);
  const isSelf = member.id === user.id;
  const hasLeader = members.some((m) => m.role === "leader");

  const canChangeRole =
    member.role === "admin" ? isSelf : member.role === "leader" ? viewerIsAdmin : member.role === "officer" ? viewerIsLeader || isSelf : true;
  const canRemove =
    !isSelf &&
    (member.role === "member" || (member.role === "officer" && viewerIsLeader) || (member.role === "leader" && viewerIsAdmin));

  const roleOptions: { value: Role; label: string }[] = [
    { value: "member", label: "Member" },
    { value: "officer", label: "Officer" }
  ];
  if (member.role === "leader" || viewerIsLeader || !hasLeader) roleOptions.push({ value: "leader", label: "Leader" });
  if (member.role === "admin" || viewerIsAdmin) roleOptions.push({ value: "admin", label: "Admin" });

  async function patch(key: string, body: Record<string, unknown>, success: string) {
    setError(null);
    setNotice(null);
    setBusy(key);
    try {
      await api(`/api/users/${member!.id}`, { method: "PATCH", body });
      await reload();
      setNotice(success);
      // Handing over leadership or stepping down changes what you can do.
      if (isSelf || body.role === "leader" || body.role === "admin") await refreshMe();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(role: Role) {
    const m = member as Member;
    if (role === "admin") {
      const ok = await confirm(
        `Make ${m.displayName} the Admin?`,
        "You'll become the Leader, and the current Leader becomes an officer. Only the Admin can pass the role on.",
        "Make Admin"
      );
      if (!ok) return;
    } else if (role === "leader") {
      const ok = await confirm(
        `Make ${m.displayName} the Leader?`,
        hasLeader ? "There's only one Leader. The current Leader becomes an officer." : "They'll be the alliance's Leader.",
        "Make Leader"
      );
      if (!ok) return;
    }
    const label = role === "admin" ? "the Admin" : role === "leader" ? "the Leader" : role === "officer" ? "an officer" : "a member";
    await patch("role", { role }, `${m.displayName} is now ${label}.`);
  }

  async function remove() {
    const m = member as Member;
    const ok = await confirm(
      `Remove ${m.displayName}?`,
      "They leave the alliance but keep their account and roster, and can rejoin with the code.",
      "Remove",
      true
    );
    if (!ok) return;
    setBusy("remove");
    try {
      await api(`/api/users/${m.id}`, { method: "DELETE" });
      router.back();
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
            <Text style={styles.name}>{member.displayName}</Text>
            <Text style={styles.username}>@{member.username}</Text>
          </View>
          <RoleBadge role={member.role} />
        </View>
      </Panel>

      <Message kind="notice">{notice}</Message>
      <Message kind="error">{error}</Message>

      <Panel>
        <Label>Battlegroup</Label>
        <Segmented<1 | 2 | 3 | null>
          options={[
            { value: null, label: "None" },
            { value: 1, label: "BG 1" },
            { value: 2, label: "BG 2" },
            { value: 3, label: "BG 3" }
          ]}
          value={member.battlegroup}
          disabled={busy !== null}
          onChange={(battlegroup) =>
            patch("bg", { battlegroup }, battlegroup ? `Moved to Battlegroup ${battlegroup}.` : "Removed from their battlegroup.")
          }
        />
        <Body style={{ fontSize: 13 }}>Each battlegroup holds up to 10 members. Their roster feeds that battlegroup&apos;s defender plan.</Body>
      </Panel>

      <Panel>
        <Label>Role</Label>
        <Segmented<Role> options={roleOptions} value={member.role} disabled={!canChangeRole || busy !== null} onChange={changeRole} />
        <Body style={{ fontSize: 13 }}>
          {canChangeRole
            ? "Officers plan wars and manage members. There's one Leader, and only they (or the Admin) can remove officers."
            : member.role === "admin"
              ? "Only the Admin can change their own role."
              : member.role === "leader"
                ? "Only the Admin can change the Leader's role. The Leader can hand leadership to someone else."
                : "Only the Leader or the Admin can change an officer's role."}
        </Body>
      </Panel>

      {canRemove && <Button title="Remove from alliance" icon="user-x" variant="danger" onPress={remove} loading={busy === "remove"} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.parchment, textTransform: "uppercase" },
  username: { fontFamily: fonts.mono, fontSize: 13, color: colors.parchmentFaint, marginTop: 2 }
});
