import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { colors, fonts } from "@/lib/theme";

export function IconButton({
  icon,
  label,
  onPress
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: "rgba(255,255,255,0.08)" }]}
    >
      <Feather name={icon} size={20} color={colors.parchmentDim} />
    </Pressable>
  );
}

/** The member's initials in a brass-to-crimson circle; opens the Account screen. */
export function AccountButton() {
  const { user } = useAuth();
  const initials = (user?.displayName ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return (
    <Pressable
      onPress={() => router.push("/account")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Account"
      style={styles.avatar}
    >
      <Text style={styles.avatarText}>{initials || "?"}</Text>
    </Pressable>
  );
}

export function HeaderRight({ onReload }: { onReload?: () => void }) {
  return (
    <View style={styles.row}>
      {onReload && <IconButton icon="refresh-cw" label="Reload" onPress={onReload} />}
      <AccountButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 12 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.crimson,
    borderWidth: 2,
    borderColor: colors.brass,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 13, color: "#fff" }
});
