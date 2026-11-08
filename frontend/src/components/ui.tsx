import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { Feather } from "@react-native-vector-icons/feather";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import type { Availability } from "@/src/api";
import { fonts, radius, space, ThemeColors, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Feather name={name} size={size} color={color ?? colors.onSurface} />;
}

/** Pressable with a gentle scale press-state. */
export function Tap({ children, style, onPress, testID, disabled, hitSlop }: {
  children: React.ReactNode; style?: any; onPress?: () => void; testID?: string; disabled?: boolean; hitSlop?: number;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={() => (s.value = withTiming(0.96, { duration: 90 }))}
      onPressOut={() => (s.value = withTiming(1, { duration: 140 }))}
    >
      <Animated.View style={[style, a, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Button({ label, onPress, testID, variant = "primary", icon, loading, disabled, style, colorsOverride }: {
  label: string; onPress?: () => void; testID?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; icon?: IconName;
  loading?: boolean; disabled?: boolean; style?: ViewStyle; colorsOverride?: ThemeColors;
}) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  const bg = { primary: colors.onSurface, secondary: "transparent", ghost: "transparent", danger: colors.error }[variant];
  const fg = { primary: colors.surface, secondary: colors.onSurface, ghost: colors.brandPrimary, danger: colors.onError }[variant];
  return (
    <Tap testID={testID} onPress={onPress} disabled={disabled || loading}
      style={[styles.btn, { backgroundColor: bg, borderColor: variant === "secondary" ? colors.borderStrong : bg }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Feather name={icon} size={16} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Tap>
  );
}

export function IconButton({ name, onPress, testID, color, size = 20, style }: {
  name: IconName; onPress?: () => void; testID: string; color?: string; size?: number; style?: ViewStyle;
}) {
  const { colors } = useTheme();
  return (
    <Tap testID={testID} onPress={onPress} hitSlop={6} style={[styles.iconBtn, style]}>
      <Feather name={name} size={size} color={color ?? colors.onSurface} />
    </Tap>
  );
}

export function Eyebrow({ children, color, style }: { children: React.ReactNode; color?: string; style?: any }) {
  const { colors } = useTheme();
  return <Text style={[styles.eyebrow, { color: color ?? colors.brandPrimary }, style]}>{children}</Text>;
}

export function SectionHeader({ eyebrow, title, action, onAction, testID, color }: {
  eyebrow?: string; title: string; action?: string; onAction?: () => void; testID?: string; color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {eyebrow && <Eyebrow color={color}>{eyebrow}</Eyebrow>}
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>{title}</Text>
      </View>
      {action && (
        <Pressable testID={testID} onPress={onAction} hitSlop={10} style={styles.sectionAction}>
          <Text style={[styles.sectionActionText, { color: colors.muted }]}>{action}</Text>
          <Feather name="arrow-right" size={14} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

export const AVAIL_STYLE: Record<Availability, { icon: IconName; tone: keyof ThemeColors }> = {
  "READ ONLINE": { icon: "book-open", tone: "success" },
  "READ AT SOURCE": { icon: "external-link", tone: "brandPrimary" },
  "BORROW TO READ": { icon: "clock", tone: "warning" },
  "METADATA ONLY": { icon: "file-text", tone: "muted" },
  "NOT CURRENTLY AVAILABLE": { icon: "slash", tone: "error" },
};

export function AvailabilityBadge({ value, testID, colorsOverride }: { value: Availability; testID?: string; colorsOverride?: ThemeColors }) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  const st = AVAIL_STYLE[value] ?? AVAIL_STYLE["METADATA ONLY"];
  const c = colors[st.tone] as string;
  return (
    <View testID={testID} style={[styles.badge, { borderColor: c }]}>
      <Feather name={st.icon} size={11} color={c} />
      <Text style={[styles.badgeText, { color: c }]}>{value}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, testID, colorsOverride }: {
  label: string; active?: boolean; onPress?: () => void; testID?: string; colorsOverride?: ThemeColors;
}) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  return (
    <Pressable testID={testID} onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.onSurface : "transparent", borderColor: active ? colors.onSurface : colors.border }]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: active ? colors.surface : colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[styles.fieldLabel, { color: colors.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, { color: colors.onSurface, borderColor: error ? colors.error : colors.border, backgroundColor: colors.surfaceSecondary },
          props.multiline && { minHeight: 96, textAlignVertical: "top", paddingTop: 12 }, props.style]}
      />
      {!!error && <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text>}
    </View>
  );
}

export function StateView({ kind, title, body, onRetry, testID }: {
  kind: "loading" | "empty" | "error"; title?: string; body?: string; onRetry?: () => void; testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.state}>
      {kind === "loading" ? <ActivityIndicator color={colors.brandPrimary} /> : (
        <Feather name={kind === "error" ? "cloud-off" : "book"} size={28} color={colors.brandPrimary} />
      )}
      {title && <Text style={[styles.stateTitle, { color: colors.onSurface }]}>{title}</Text>}
      {body && <Text style={[styles.stateBody, { color: colors.muted }]}>{body}</Text>}
      {onRetry && <Button testID={testID ? `${testID}-retry` : undefined} label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: space.lg }} />}
    </View>
  );
}

export function Checkbox({ checked, onToggle, label, testID, colorsOverride }: {
  checked: boolean; onToggle: () => void; label: string; testID: string; colorsOverride?: ThemeColors;
}) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  return (
    <Pressable testID={testID} onPress={onToggle} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
      <View style={[styles.checkBox, { borderColor: checked ? colors.brandPrimary : colors.borderStrong, backgroundColor: checked ? colors.brandPrimary : "transparent" }]}>
        {checked && <Feather name="check" size={14} color={colors.onBrandPrimary} />}
      </View>
      <Text style={[styles.checkLabel, { color: colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

const styles = StyleSheet.create({
  btn: { minHeight: 50, borderRadius: radius.pill, paddingHorizontal: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, borderWidth: 1 },
  btnText: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.2, textTransform: "uppercase" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.xl, marginBottom: space.lg, gap: space.md },
  sectionTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, marginTop: 4 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 4 },
  sectionActionText: { fontFamily: fonts.medium, fontSize: 13 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 1.1 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipText: { fontFamily: fonts.medium, fontSize: 13 },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16 },
  fieldError: { fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  state: { alignItems: "center", justifyContent: "center", padding: space.xxl, gap: space.sm, minHeight: 220 },
  stateTitle: { fontFamily: fonts.display, fontSize: 22, textAlign: "center", marginTop: space.sm },
  stateBody: { fontFamily: fonts.body, fontSize: 14, textAlign: "center", lineHeight: 21, maxWidth: 300 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  checkBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
});
