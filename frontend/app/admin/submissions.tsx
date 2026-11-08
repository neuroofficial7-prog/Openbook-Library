import React, { useCallback, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdmin } from "@/src/admin-context";
import { api } from "@/src/api";
import { AdminHeader } from "@/src/components/AdminHeader";
import { Button, Chip, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

type Sub = { id: string; title: string; author: string; description: string; isbn: string; publication_year: number | null; language: string; category: string; publisher: string;
  reading_url: string | null; licence: string; contributor_role: string; adult_content: boolean; status: string; duplicate_of: string | null; submitted_by: string;
  created_at: string; has_text: boolean; text_preview: string; review_note?: string };

export default function AdminSubmissions() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { admin, can } = useAdmin();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Sub[] | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setErr("");
    try { setRows(await api<Sub[]>(`/admin/submissions?status=${status}`, { admin: true })); } catch (e) { setErr(errMsg(e)); }
  }, [status]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!admin) return <StateView testID="admin-required" kind="error" title="Admin sign-in required" onRetry={() => router.replace("/admin")} />;

  const review = async (s: Sub, decision: "approve" | "reject") => {
    try { await api(`/admin/submissions/${s.id}/review`, { method: "POST", body: { decision, note: notes[s.id] ?? "" }, admin: true }); toast(decision === "approve" ? "Approved and published" : "Submission rejected", "success"); load(); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  return (
    <View style={styles.root} testID="admin-submissions-screen">
      <AdminHeader title="Submission review" eyebrow="Contributors" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipInner}>
        {["pending", "approved", "rejected"].map((s) => <Chip key={s} testID={`subs-filter-${s}`} label={s[0].toUpperCase() + s.slice(1)} active={status === s} onPress={() => setStatus(s)} />)}
      </ScrollView>
      {!rows && !err && <StateView kind="loading" testID="subs-loading" />}
      {!!err && <StateView kind="error" testID="subs-error" title="Could not load submissions" body={err} onRetry={load} />}
      {rows && (
        <FlatList data={rows} keyExtractor={(s) => s.id} contentContainerStyle={{ padding: space.xl, paddingTop: 0, paddingBottom: insets.bottom + space.xxl, gap: space.lg }}
          ListEmptyComponent={<StateView testID="subs-empty" kind="empty" title={`No ${status} submissions`} />}
          renderItem={({ item: s, index }) => (
            <View style={styles.card} testID={`submission-${index}`}>
              <Text style={styles.t}>{s.title}</Text>
              <Text style={styles.m}>{s.author} · {[s.publication_year, s.language, s.category].filter(Boolean).join(" · ")}</Text>
              <Text style={styles.m}>From {s.submitted_by} as {s.contributor_role.replace("_", " ")} · {new Date(s.created_at).toLocaleDateString()}</Text>
              <Text style={styles.m}>Licence: {s.licence} · Permission declared ✓{s.adult_content ? " · 18+" : ""}</Text>
              {!!s.reading_url && <Text style={styles.m}>Reading URL: {s.reading_url}</Text>}
              {!!s.description && <Text style={styles.d} numberOfLines={4}>{s.description}</Text>}
              {s.has_text && <Text style={[styles.d, styles.preview]} numberOfLines={5}>{s.text_preview}</Text>}
              {s.duplicate_of && <Text style={[styles.m, { color: colors.warning }]} testID={`submission-dup-${index}`}>Possible duplicate of an existing record ({s.duplicate_of})</Text>}
              {s.status === "pending" && can("super_admin", "admin") && (
                <>
                  <TextInput testID={`submission-note-${index}`} value={notes[s.id] ?? ""} onChangeText={(v) => setNotes({ ...notes, [s.id]: v })} placeholder="Review note (optional)" placeholderTextColor={colors.muted} style={styles.note} />
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Button testID={`submission-reject-${index}`} variant="secondary" label="Reject" onPress={() => review(s, "reject")} />
                    <Button testID={`submission-approve-${index}`} label="Approve & publish" onPress={() => review(s, "approve")} style={{ flex: 1 }} />
                  </View>
                </>
              )}
              {s.status === "pending" && !can("super_admin", "admin") && <Text style={styles.m}>An Admin must approve or reject submissions.</Text>}
              {s.status !== "pending" && <Text style={styles.m}>{s.status.toUpperCase()}{s.review_note ? ` — ${s.review_note}` : ""}</Text>}
            </View>
          )} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipRow: { height: 56, flexGrow: 0 },
  chipInner: { paddingHorizontal: space.xl, gap: space.sm, alignItems: "center" },
  card: { padding: space.lg, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, backgroundColor: c.surfaceSecondary, gap: 4 },
  t: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  m: { fontFamily: fonts.body, fontSize: 12, color: c.muted, lineHeight: 18 },
  d: { fontFamily: fonts.body, fontSize: 13, color: c.onSurface, lineHeight: 20, marginTop: space.xs },
  preview: { fontFamily: fonts.display, padding: space.sm, backgroundColor: c.surface, borderRadius: radius.sm },
  note: { minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 12, fontFamily: fonts.body, fontSize: 14, color: c.onSurface, marginVertical: space.sm, backgroundColor: c.surface },
}));
