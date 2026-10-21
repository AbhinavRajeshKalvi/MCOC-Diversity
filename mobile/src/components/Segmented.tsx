import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius } from "@/lib/theme";

type Option<T> = { value: T; label: string; disabled?: boolean };

/** A row of pill buttons for picking one option (role, battlegroup). */
export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  disabled
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        const off = disabled || option.disabled;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => !off && !active && onChange(option.value)}
            disabled={off}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled: Boolean(off) }}
            style={[styles.item, active && styles.active, off && !active && styles.off]}
          >
            <Text style={[styles.text, active && styles.activeText]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(32,35,44,0.6)",
    minWidth: 64,
    alignItems: "center"
  },
  active: { backgroundColor: colors.brassBright, borderColor: colors.brassBright },
  off: { opacity: 0.35 },
  text: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.parchmentDim },
  activeText: { color: colors.ink }
});
