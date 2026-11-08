import React, { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdmin } from "@/src/admin-context";
import { api, Book, qs } from "@/src/api";
import { AdminHeader } from "@/src/components/AdminHeader";
import { BookCover } from "@/src/components/BookCover";
import { AvailabilityBadge, Button, Chip, Icon, IconButton, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const STATUSES = [["", "All"], ["published", "Published"], ["draft", "Draft"], ["archived", "Archived"]] as const;

export default function AdminBooks() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { admin, can } = useAdmin();
  const params = useLocalSearchParams<{ language?: string; adult?: string }>();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [adult, setAdult] = useState(params.adult ?? "");
  const [rows, setRows] = useState<Book[] | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Book | null>(null);
  const [confirmDel, setConfirmDel] = useState<Book | null>(null);

  const load = useCallback(async (query = q, st = status, ad = adult) => {
    setErr("");
    try { setRows(await api<Book[]>(`/admin/books?${qs({ q: query, status: st, adult: ad, language: params.language })}`, { admin: true })); }
    catch (e) { setErr(errMsg(e)); }
  }, [q, status, adult, params.language]);

  useFocusEffect(useCallback(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, adult]));

  if (!admin) return <StateView testID="admin-required" kind="error" title="Admin sign-in required" onRetry={() => router.replace("/admin")} />;

  const setBookStatus = async (b: Book, s: string) => {
    try { await api(`/admin/books/${b.source_id}/status`, { method: "POST", body: { status: s }, admin: true }); toast(`“${b.title}” → ${s}`, "success"); setPreview(null); load(); }
    catch (e) { toast(errMsg(e), "error"); }
  };
  const del = async (b: Book) => {
    try { await api(`/admin/books/${b.source_id}`, { method: "DELETE", admin: true }); toast("Book deleted", "success"); setConfirmDel(null); setPreview(null); load(); }
    catch (e) { toast(errMsg(e), "error"); }
  };

  const title = params.language === "Mizo" ? "Mizo Library" : params.adult === "true" ? "After Dark titles" : "Books";
  return (
    <View style={styles.root} testID="admin-books-screen">
      <AdminHeader title={title} eyebrow="Book management" right={<IconButton testID="admin-add-book" name="plus" onPress={() => router.push("/admin/edit")} />} />
      <View style={styles.searchRow}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput testID="admin-books-search" value={q} onChangeText={setQ} onSubmitEditing={() => load()} returnKeyType="search" placeholder="Search title, author, ISBN" placeholderTextColor={colors.muted} style={styles.search} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipInner}>
        {STATUSES.map(([k, l]) => <Chip key={k} testID={`admin-status-${k || "all"}`} label={l} active={status === k} onPress={() => setStatus(k)} />)}
        <Chip testID="admin-filter-general" label="General" active={adult === "false"} onPress={() => setAdult(adult === "false" ? "" : "false")} />
        <Chip testID="admin-filter-adult" label="18+" active={adult === "true"} onPress={() => setAdult(adult === "true" ? "" : "true")} />
      </ScrollView>
      {!rows && !err && <StateView testID="admin-books-loading" kind="loading" />}
      {!!err && <StateView testID="admin-books-error" kind="error" title="Could not load books" body={err} onRetry={() => load()} />}
      {rows && (
        <FlatList data={rows} keyExtractor={(b) => b.id} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }}
          ListEmptyComponent={<StateView testID="admin-books-empty" kind="empty" title="No books match" body="Add a book or change the filters." />}
          renderItem={({ item, index }) => (
            <Pressable testID={`admin-book-${index}`} style={styles.row} onPress={() => setPreview(item)}>
              <BookCover book={item} width={44} height={66} />
              <View style={{ flex: 1 }}>
                <Text style={styles.t} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.m} numberOfLines={1}>{item.author} · {item.language}{item.adult_content ? " · 18+" : ""}</Text>
                <Text style={[styles.status, { color: item.publication_status === "published" ? colors.success : item.publication_status === "draft" ? colors.warning : colors.muted }]}>{item.publication_status}</Text>
              </View>
              <IconButton testID={`admin-book-edit-${index}`} name="edit-2" size={18} onPress={() => router.push(`/admin/edit?id=${item.source_id}`)} />
            </Pressable>
          )} />
      )}

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPreview(null)} />
        {preview && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} testID="admin-book-preview">
            <View style={{ flexDirection: "row", gap: space.lg }}>
              <BookCover book={preview} width={80} height={120} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pt}>{preview.title}</Text>
                <Text style={styles.m}>{preview.author}</Text>
                <Text style={styles.m}>{[preview.publication_year, preview.language, preview.category].filter(Boolean).join(" · ")}</Text>
                <View style={{ marginTop: space.sm }}><AvailabilityBadge value={preview.availability} /></View>
              </View>
            </View>
            <Text style={styles.m} numberOfLines={3}>{preview.description || "No description."}</Text>
            <Text style={styles.m}>Licence: {preview.licence} · {preview.copyright_status} · access: {preview.access_type}</Text>
            <View style={styles.actions}>
              {can("super_admin", "admin") && preview.publication_status !== "published" && <Button testID="admin-publish" label="Publish" onPress={() => setBookStatus(preview, "published")} />}
              {can("super_admin", "admin") && preview.publication_status === "published" && <Button testID="admin-unpublish" variant="secondary" label="Unpublish" onPress={() => setBookStatus(preview, "draft")} />}
              {can("super_admin", "admin") && preview.publication_status !== "archived" && <Button testID="admin-archive" variant="secondary" label="Archive" onPress={() => setBookStatus(preview, "archived")} />}
              <Button testID="admin-edit" variant="secondary" label="Edit" onPress={() => { setPreview(null); router.push(`/admin/edit?id=${preview.source_id}`); }} />
              {can("super_admin", "admin") && <Button testID="admin-delete" variant="danger" label="Delete" onPress={() => setConfirmDel(preview)} />}
            </View>
            {!can("super_admin", "admin") && <Text style={styles.m}>Editors can edit drafts. An Admin publishes, archives or deletes.</Text>}
            {confirmDel && (
              <View style={styles.confirm} testID="admin-delete-confirm">
                <Text style={styles.t}>Delete “{confirmDel.title}” permanently?</Text>
                <View style={styles.actions}>
                  <Button testID="admin-delete-cancel" variant="secondary" label="Cancel" onPress={() => setConfirmDel(null)} />
                  <Button testID="admin-delete-confirm-button" variant="danger" label="Delete" onPress={() => del(confirmDel)} />
                </View>
              </View>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.xl, marginTop: space.md, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  search: { flex: 1, minHeight: 46, fontFamily: fonts.body, fontSize: 15, color: c.onSurface },
  chipRow: { height: 56, flexGrow: 0 },
  chipInner: { paddingHorizontal: space.xl, gap: space.sm, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  t: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  pt: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  m: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: space.xs, lineHeight: 18 },
  status: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: c.scrim },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, gap: space.sm },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  confirm: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.error },
}));
