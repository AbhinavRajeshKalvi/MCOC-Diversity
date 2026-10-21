import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "@/lib/theme";
import { ROLE_LABEL, type Role } from "@/lib/types";

const ROLE_STYLE: Record<Role, { color: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"] | null }> = {
  admin: { color: colors.mystic, icon: "diamond-stone" },
  leader: { color: colors.brassBright, icon: "crown" },
  officer: { color: colors.tealBright, icon: "shield-star" },
  member: { color: colors.parchmentFaint, icon: null }
};

export function RoleBadge({ role }: { role: Role }) {
  const { color, icon } = ROLE_STYLE[role];
  return (
    <View style={[styles.badge, { borderColor: `${color}66`, backgroundColor: `${color}14` }]}>
      {icon && <MaterialCommunityIcons name={icon} size={12} color={color} />}
      <Text style={[styles.text, { color }]}>{ROLE_LABEL[role]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  text: { fontFamily: fonts.bodySemi, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }
});
