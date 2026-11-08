import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { useAdmin } from "@/src/admin-context";
import { api, Book } from "@/src/api";
import { Button, Eyebrow, Field, Icon, IconButton, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

type Stats = {
  total_books: number; published: number; drafts: number; archived: number; pending_submissions: number; registered_users: number;
  active_readers: number; mizo_books: number; most_read: { book_id: string; title: string; readers: number }[]; recent: Book[];
  sources: { name: string; ok: boolean; error: string; checked_at: string }[];
};

export default function AdminHome() {
  const { admin, ready } = useAdmin();
  if (!ready) return <StateView kind="loading" testID="admin-loading" />;
  return admin ? <Dashboard /> : <AdminLogin />;
}

function AdminLogin() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { login } = useAdmin();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim() || !pw) return toast("Enter your staff email and password", "error");
    setBusy(true);
    try { await login(email.trim(), pw); } catch (e) { toast(errMsg(e), "error"); } finally { setBusy(false); }
  };
  return (
    <View style={styles.root} testID="admin-login-screen">
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.sm }}>
        <IconButton testID="admin-login-back" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl }}>
        <Icon name="shield" size={28} />
        <Eyebrow style={{ marginTop: space.lg }}>Staff only</Eyebrow>
        <Text style={styles.title}>OpenBook Administration</Text>
        <Text style={styles.sub}>Separate sign-in for Super Admins, Admins and Editors. Reader accounts cannot access this area.</Text>
        <Field testID="admin-email-input" label="Staff email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field testID="admin-password-input" label="Password" value={pw} onChangeText={setPw} secureTextEntry onSubmitEditing={submit} />
        <Button testID="admin-login-button" label="Sign in to dashboard" loading={busy} onPress={submit} />
      </KeyboardAwareScrollView>
    </View>
  );
}

function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { admin, logout, can } = useAdmin();
  const q = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats", { admin: true }) });
  const [checking, setChecking] = useState(false);
  const s = q.data;

  const check = async () => {
    setChecking(true);
    try { await api("/admin/sources/check", { method: "POST", admin: true }); await q.refetch(); toast("Source status refreshed"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setChecking(false); }
  };

  const modules: { key: string; label: string; icon: any; to: string; show: boolean; note?: string }[] = [
    { key: "books", label: "Book Management", icon: "book", to: "/admin/books", show: true },
    { key: "add", label: "Add a Book", icon: "plus-circle", to: "/admin/edit", show: true },
    { key: "mizo", label: "Mizo Library Management", icon: "feather", to: "/admin/books?language=Mizo", show: true },
    { key: "adult", label: "After Dark (18+) Titles", icon: "moon", to: "/admin/books?adult=true", show: true },
    { key: "subs", label: "Submission Review", icon: "inbox", to: "/admin/submissions", show: true, note: s?.pending_submissions ? `${s.pending_submissions} pending` : undefined },
    { key: "users", label: "User Management", icon: "users", to: "/admin/users", show: can("super_admin", "admin") },
    { key: "audit", label: "Audit Logs", icon: "activity", to: "/admin/audit", show: can("super_admin", "admin") },
  ];
  const maxRead = Math.max(1, ...(s?.most_read.map((m) => m.readers) ?? [1]));

  return (
    <View style={styles.root} testID="admin-dashboard">
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="admin-exit" name="arrow-left" onPress={() => router.replace("/")} />
        <View style={{ flex: 1 }}>
          <Eyebrow>{admin?.roles.join(", ").replace("_", " ")}</Eyebrow>
          <Text style={styles.hTitle}>Dashboard</Text>
        </View>
        <IconButton testID="admin-logout" name="log-out" onPress={async () => { await logout(); toast("Signed out of admin"); }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}>
        {q.isLoading && <StateView kind="loading" testID="admin-stats-loading" />}
        {q.isError && <StateView kind="error" testID="admin-stats-error" title="Could not load statistics" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {s && (
          <>
            <View style={styles.grid}>
              <Stat testID="stat-total" label="Total books" value={s.total_books} />
              <Stat testID="stat-published" label="Published" value={s.published} />
              <Stat testID="stat-drafts" label="Drafts" value={s.drafts} />
              <Stat testID="stat-pending" label="Pending submissions" value={s.pending_submissions} accent />
              <Stat testID="stat-users" label="Registered users" value={s.registered_users} />
              <Stat testID="stat-active" label="Active readers (30d)" value={s.active_readers} />
            </View>
            <Text style={styles.note}>Counts are live from the OpenBook database; external catalogue books are indexed on demand and not counted.</Text>

            <Text style={styles.block}>Catalogue status</Text>
            <View style={styles.stack}>
              {[["Published", s.published, colors.success], ["Draft", s.drafts, colors.warning], ["Archived", s.archived, colors.borderStrong]].map(([l, v, c]) => (
                <View key={l as string} style={{ flex: Math.max(Number(v), 0.0001), backgroundColor: c as string }} />
              ))}
            </View>
            <Text style={styles.note}>{s.published} published · {s.drafts} draft · {s.archived} archived · {s.mizo_books} Mizo titles</Text>

            <Text style={styles.block}>Most-read books</Text>
            {s.most_read.length === 0 && <Text style={styles.note}>No reading activity recorded yet.</Text>}
            {s.most_read.map((m, i) => (
              <View key={m.book_id} style={styles.barRow} testID={`most-read-${i}`}>
                <Text style={styles.barLabel} numberOfLines={1}>{m.title}</Text>
                <View style={styles.barTrack}><View style={[styles.barFill, { width: `${(m.readers / maxRead) * 100}%` }]} /></View>
                <Text style={styles.barVal}>{m.readers}</Text>
              </View>
            ))}

            <View style={styles.rowBetween}>
              <Text style={styles.block}>Source integrations</Text>
              <Button testID="admin-check-sources" label="Check now" variant="ghost" loading={checking} onPress={check} style={{ minHeight: 36, paddingHorizontal: 0 }} />
            </View>
            {s.sources.length === 0 && <Text style={styles.note}>No calls made yet since the server started — tap “Check now”.</Text>}
            {s.sources.map((src) => (
              <View key={src.name} style={styles.srcRow} testID={`source-${src.name}`}>
                <View style={[styles.dot, { backgroundColor: src.ok ? colors.success : colors.error }]} />
                <Text style={styles.srcName}>{src.name}</Text>
                <Text style={styles.srcState} numberOfLines={1}>{src.ok ? "Online" : `Unreachable${src.error ? ` · ${src.error}` : ""}`}</Text>
              </View>
            ))}

            <Text style={styles.block}>Modules</Text>
            {modules.filter((m) => m.show).map((m) => (
              <Pressable key={m.key} testID={`admin-module-${m.key}`} style={styles.mod} onPress={() => router.push(m.to as any)}>
                <Icon name={m.icon} size={18} color={colors.brandPrimary} />
                <Text style={styles.modText}>{m.label}</Text>
                {m.note && <Text style={styles.modNote}>{m.note}</Text>}
                <Icon name="chevron-right" size={16} color={colors.muted} />
              </Pressable>
            ))}

            <Text style={styles.block}>Recently added</Text>
            {s.recent.length === 0 && <Text style={styles.note}>No books added yet. Use “Add a Book” to create the first record.</Text>}
            {s.recent.map((b, i) => (
              <Pressable key={b.id} testID={`admin-recent-${i}`} style={styles.mod} onPress={() => router.push(`/admin/edit?id=${b.source_id}`)}>
                <Text style={[styles.modText, { fontFamily: fonts.display }]} numberOfLines={1}>{b.title}</Text>
                <Text style={styles.modNote}>{b.publication_status}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, testID, accent }: { label: string; value: number; testID: string; accent?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, accent && { borderColor: colors.brandPrimary }]} testID={testID}>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: c.onSurface, marginTop: space.sm },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.muted, marginTop: space.sm, marginBottom: space.xl },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  hTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  stat: { width: "47.5%", padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  statVal: { fontFamily: fonts.display, fontSize: 34, color: c.onSurface },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: c.muted, marginTop: 2 },
  note: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: space.sm, lineHeight: 18 },
  block: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: c.muted, marginTop: space.xxl, marginBottom: space.md },
  stack: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: c.surfaceTertiary },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.sm },
  barLabel: { width: 120, fontFamily: fonts.body, fontSize: 13, color: c.onSurface },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: c.brandPrimary },
  barVal: { width: 28, textAlign: "right", fontFamily: fonts.bold, fontSize: 12, color: c.onSurface },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  srcRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 40 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  srcName: { fontFamily: fonts.medium, fontSize: 14, color: c.onSurface, width: 130 },
  srcState: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: c.muted },
  mod: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 54, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  modText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: c.onSurface },
  modNote: { fontFamily: fonts.bold, fontSize: 11, color: c.brandPrimary, textTransform: "uppercase", letterSpacing: 1 },
}));
