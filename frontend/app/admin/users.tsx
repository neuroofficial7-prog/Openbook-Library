import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdmin } from "@/src/admin-context";
import { api } from "@/src/api";
import { AdminHeader } from "@/src/components/AdminHeader";
import { Button, Chip, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

type U = { id: string; email: string; name: string; roles: string[]; disabled: boolean; created_at: string };
const ROLES = ["reader", "editor", "admin", "super_admin"];

export default function AdminUsers() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { admin, can } = useAdmin();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<U[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async (query = "") => {
    setErr("");
    try { setRows(await api<U[]>(`/admin/users?q=${encodeURIComponent(query)}`, { admin: true })); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!admin) return <StateView testID="admin-required" kind="error" title="Admin sign-in required" onRetry={() => router.replace("/admin")} />;

  const patch = async (u: U, body: Partial<U>) => {
    try { await api(`/admin/users/${u.id}`, { method: "PATCH", body, admin: true }); toast("User updated", "success"); load(q); } catch (e) { toast(errMsg(e), "error"); }
  };

  return (
    <View style={styles.root} testID="admin-users-screen">
      <AdminHeader title="Users" eyebrow="User management" />
      <TextInput testID="admin-users-search" value={q} onChangeText={setQ} onSubmitEditing={() => load(q)} returnKeyType="search" placeholder="Search by email" placeholderTextColor={colors.muted} style={styles.search} />
      {!rows && !err && <StateView kind="loading" testID="users-loading" />}
      {!!err && <StateView kind="error" testID="users-error" title="Could not load users" body={err} onRetry={() => load(q)} />}
      {rows && (
        <FlatList data={rows} keyExtractor={(u) => u.id} contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.md }}
          ListEmptyComponent={<StateView kind="empty" testID="users-empty" title="No users found" />}
          renderItem={({ item: u, index }) => (
            <View style={styles.card} testID={`user-${index}`}>
              <Text style={styles.t}>{u.name || "—"}</Text>
              <Text style={styles.m}>{u.email} · joined {new Date(u.created_at).toLocaleDateString()}{u.disabled ? " · DISABLED" : ""}</Text>
              {u.id !== admin.id && (
                <>
                  {can("super_admin") && (
                    <View style={styles.wrap}>
                      {ROLES.map((r) => <Chip key={r} testID={`user-${index}-role-${r}`} label={r.replace("_", " ")} active={u.roles.includes(r)} onPress={() => patch(u, { roles: [r] })} />)}
                    </View>
                  )}
                  {!can("super_admin") && <Text style={styles.m}>Roles: {u.roles.join(", ")} (only a Super Admin can change roles)</Text>}
                  <Button testID={`user-${index}-toggle`} variant={u.disabled ? "secondary" : "danger"} label={u.disabled ? "Enable account" : "Disable account"}
                    onPress={() => patch(u, { disabled: !u.disabled })} style={{ marginTop: space.sm, minHeight: 40 }} />
                </>
              )}
              {u.id === admin.id && <Text style={styles.m}>This is you ({u.roles.join(", ")}).</Text>}
            </View>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  search: { marginHorizontal: space.xl, marginTop: space.md, minHeight: 46, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: c.onSurface },
  card: { padding: space.lg, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 4 },
  t: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  m: { fontFamily: fonts.body, fontSize: 12, color: c.muted, lineHeight: 18 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
}));
