import React from "react";
import { Stack } from "expo-router";

import { AdminProvider } from "@/src/admin-context";
import { useTheme } from "@/src/theme";

export default function AdminLayout() {
  const { colors } = useTheme();
  return (
    <AdminProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </AdminProvider>
  );
}
