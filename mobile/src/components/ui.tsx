import { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { CLASS_STRIPE, colors, fonts, radius } from "@/lib/theme";

/** A full-height scrolling screen on the war-room background, with keyboard avoidance for forms. */
export function Screen({
  children,
  edges = ["top", "bottom"],
  contentStyle,
  centered = false
}: {
  children: React.ReactNode;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  centered?: boolean;
}) {
  return (
    <View style={styles.fill}>
      <Backdrop />
      <SafeAreaView style={styles.fill} edges={edges}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={[styles.screenContent, centered && styles.centered, contentStyle]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.maxWidth}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** The website's background: dark gunmetal with ember and crimson glows in the top corners. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={["#12141b", "#0d0f14", "#0a0b0f"]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(232,140,48,0.18)", "rgba(232,140,48,0)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(194,54,78,0.16)", "rgba(194,54,78,0)"]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** The "WR" brand mark, "War Room" wordmark and class-color stripe from the website's sign-in page. */
export function Brand({ subtitle = "Alliance defender diversity planner" }: { subtitle?: string }) {
  return (
    <View style={styles.brand}>
      <BrandMark size={60} />
      <Text style={styles.brandTitle}>War Room</Text>
      <Text style={styles.brandSubtitle}>{subtitle}</Text>
      <ClassStripe />
    </View>
  );
}

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <LinearGradient
      colors={[colors.brassBright, colors.brass, colors.crimson]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.brandMark, { width: size, height: size, borderRadius: size * 0.22 }]}
    >
      <Text style={[styles.brandMarkText, { fontSize: size * 0.45 }]}>WR</Text>
    </LinearGradient>
  );
}

export function ClassStripe() {
  return (
    <View style={styles.stripe}>
      {CLASS_STRIPE.map((color) => (
        <View key={color} style={[styles.stripeBar, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={["#1d2029", "#161920", "#121419"]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.panel, style]}>
      {children}
    </LinearGradient>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

/** A section heading with the website's brass-to-crimson accent bar. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <LinearGradient colors={[colors.brassBright, colors.crimson]} style={styles.sectionBar} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export function Body({ children, style, dim = true }: { children: React.ReactNode; style?: StyleProp<TextStyle>; dim?: boolean }) {
  return <Text style={[styles.body, !dim && { color: colors.parchment }, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

type FieldProps = TextInputProps & { label: string; hint?: string; password?: boolean };

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, password, style, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={[styles.inputWrap, focused && styles.inputFocused]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.parchmentFaint}
          selectionColor={colors.brass}
          secureTextEntry={password && !shown}
          autoCapitalize={password ? "none" : props.autoCapitalize}
          autoCorrect={password ? false : props.autoCorrect}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {password && (
          <Pressable
            onPress={() => setShown((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={shown ? "Hide password" : "Show password"}
            style={styles.eye}
          >
            <Feather name={shown ? "eye-off" : "eye"} size={18} color={colors.parchmentFaint} />
          </Pressable>
        )}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>["name"];
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, style }: ButtonProps) {
  const inactive = disabled || loading;
  const textColor = variant === "primary" ? colors.ink : variant === "danger" ? colors.crimsonBright : colors.parchment;
  const content = (
    <View style={styles.buttonInner}>
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : icon ? (
        <Feather name={icon} size={16} color={textColor} />
      ) : null}
      <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && !inactive && styles.buttonPressed,
        style
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient colors={[colors.brassBright, colors.brass]} style={styles.buttonGradient}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function TextLink({ title, onPress, style }: { title: string; onPress: () => void; style?: StyleProp<TextStyle> }) {
  return (
    <Text onPress={onPress} accessibilityRole="link" style={[styles.link, style]} suppressHighlighting>
      {title}
    </Text>
  );
}

export function Message({ kind, children }: { kind: "error" | "notice" | "warning"; children: React.ReactNode }) {
  if (!children) return null;
  const color = kind === "error" ? colors.crimsonBright : kind === "notice" ? colors.tealBright : colors.brass;
  return (
    <View style={[styles.message, { borderColor: `${color}55`, backgroundColor: `${color}14` }]} accessibilityLiveRegion="polite">
      <Feather name={kind === "error" ? "alert-circle" : kind === "notice" ? "check-circle" : "info"} size={16} color={color} />
      <Text style={[styles.messageText, { color }]}>{children}</Text>
    </View>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      {label ? <Text style={styles.dividerLabel}>{label}</Text> : null}
      {label ? <View style={styles.dividerLine} /> : null}
    </View>
  );
}

export function Loading({ message }: { message?: string }) {
  return (
    <View style={[styles.fill, styles.loading]}>
      <Backdrop />
      <BrandMark size={56} />
      <ActivityIndicator color={colors.brassBright} style={{ marginTop: 24 }} />
      {message ? <Text style={[styles.body, { marginTop: 12, textAlign: "center" }]}>{message}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  screenContent: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  centered: { justifyContent: "center" },
  maxWidth: { width: "100%", maxWidth: 480, alignSelf: "center", gap: 16 },
  loading: { alignItems: "center", justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 12 },
  brandTitle: {
    fontFamily: fonts.display,
    fontSize: 48,
    lineHeight: 52,
    color: colors.brassBright,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 14
  },
  brandSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.parchmentFaint,
    textTransform: "uppercase",
    letterSpacing: 2.5,
    marginTop: 4
  },
  brandMark: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brassBright,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8
  },
  brandMarkText: { fontFamily: fonts.display, color: colors.ink },
  stripe: { flexDirection: "row", gap: 6, marginTop: 14 },
  stripeBar: { height: 4, width: 24, borderRadius: 2, opacity: 0.85 },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(47,51,63,0.8)",
    padding: 18,
    gap: 14
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.parchment,
    textTransform: "uppercase",
    letterSpacing: 1
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionBar: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: {
    fontFamily: fonts.displaySemi,
    fontSize: 20,
    color: colors.parchment,
    textTransform: "uppercase",
    letterSpacing: 1.5
  },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.parchmentDim },
  label: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    color: colors.parchmentDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6
  },
  field: {},
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13,15,20,0.7)",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm
  },
  inputFocused: { borderColor: "rgba(224,169,59,0.75)" },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.parchment,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "android" ? 10 : 12,
    minHeight: 46
  },
  eye: { paddingHorizontal: 12 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.parchmentFaint, marginTop: 6 },
  button: { borderRadius: radius.sm, overflow: "hidden", minHeight: 48 },
  buttonGradient: { flex: 1, justifyContent: "center" },
  buttonGhost: {
    backgroundColor: "rgba(32,35,44,0.6)",
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: "center"
  },
  buttonDanger: {
    backgroundColor: "rgba(194,54,78,0.1)",
    borderWidth: 1,
    borderColor: "rgba(194,54,78,0.5)",
    justifyContent: "center"
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  buttonInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 15 },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.brassBright },
  message: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 12
  },
  messageText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerLabel: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.parchmentFaint, textTransform: "uppercase", letterSpacing: 1.5 }
});
