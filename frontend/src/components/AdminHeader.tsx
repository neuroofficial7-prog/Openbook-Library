import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Eyebrow, IconButton } from "@/src/components/ui";
import { fonts, space, useTheme } from "@/src/theme";

export function AdminHeader({ title, eyebrow = "Admin", right }: { title: string; eyebrow?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={[styles.h, { paddingTop: insets.top + space.xs, borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <IconButton testID="admin-back-button" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin"))} />
      <View style={{ flex: 1 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Text style={[styles.t, { color: colors.onSurface }]} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  t: { fontFamily: fonts.display, fontSize: 24 },
});
