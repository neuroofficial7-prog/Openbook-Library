import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { Feather } from "@react-native-vector-icons/feather";

import { usesNativeTabs } from "@/src/navigation";
import { fonts, useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="books.vertical.fill" />
          <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="mizo">
          <NativeTabs.Trigger.Icon sf="building.columns.fill" />
          <NativeTabs.Trigger.Label>Mizo</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="shelf">
          <NativeTabs.Trigger.Icon sf="bookmark.fill" />
          <NativeTabs.Trigger.Label>My Shelf</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  const icon = (name: React.ComponentProps<typeof Feather>["name"]) =>
    function TabIcon({ color }: { color: string }) {
      return <Feather name={name} size={21} color={color} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.borderStrong,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, ...(Platform.OS === "web" ? { height: 64 } : {}) },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Library", tabBarIcon: icon("book-open"), tabBarButtonTestID: "tab-home" } as any} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: icon("search"), tabBarButtonTestID: "tab-search" } as any} />
      <Tabs.Screen name="mizo" options={{ title: "Mizo", tabBarIcon: icon("feather"), tabBarButtonTestID: "tab-mizo" } as any} />
      <Tabs.Screen name="shelf" options={{ title: "My Shelf", tabBarIcon: icon("bookmark"), tabBarButtonTestID: "tab-shelf" } as any} />
    </Tabs>
  );
}
