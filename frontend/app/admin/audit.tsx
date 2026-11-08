import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAdmin } from "@/src/admin-context";
import { api } from "@/src/api";
import { AdminHeader } from "@/src/components/AdminHeader";
import { StateView } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";

type Log = { user_email: string; action: string; target: string; detail: string; created_at: string };

export default function AdminAudit() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { admin } = useAdmin();
  const q = useQuery({ queryKey: ["audit"], queryFn: () => api<Log[]>("/admin/audit", { admin: true }), enabled: !!admin });
  if (!admin) return <StateView testID="admin-required" kind="error" title="Admin sign-in required" onRetry={() => router.replace("/admin")} />;
  return (
    <View style={styles.root} testID="admin-audit-screen">
      <AdminHeader title="Audit logs" eyebrow="Security" />
      {q.isLoading && <StateView kind="loading" testID="audit-loading" />}
      {q.isError && <StateView kind="error" testID="audit-error" title="Could not load logs" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && (
        <FlatList data={q.data} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl }}
          ListEmptyComponent={<StateView kind="empty" testID="audit-empty" title="No admin actions recorded yet" />}
          renderItem={({ item, index }) => (
            <View style={styles.row} testID={`audit-${index}`}>
              <Text style={styles.a}>{item.action}</Text>
              <Text style={styles.m}>{item.user_email} · {new Date(item.created_at).toLocaleString()}</Text>
              {!!(item.detail || item.target) && <Text style={styles.m} numberOfLines={2}>{item.detail || item.target}</Text>}
            </View>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  row: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  a: { fontFamily: fonts.bold, fontSize: 13, color: c.onSurface, letterSpacing: 0.4 },
  m: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
}));
