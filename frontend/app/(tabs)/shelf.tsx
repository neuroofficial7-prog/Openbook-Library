import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Book } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BookRow } from "@/src/components/ShelfRow";
import { Button, Chip, Eyebrow, Field, Icon, StateView, errMsg } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { continueReading, localBookmarks } from "@/src/reader-store";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

const CATS = ["Fiction", "Non-fiction", "Romance", "Mystery", "Thriller", "Fantasy", "Science Fiction", "History", "Biography", "Philosophy", "Poetry", "Education", "Religion", "Academic Books", "Children's Literature"];
const LANGS = ["English", "Mizo", "Hindi", "French", "Spanish", "German"];
type Snap = { book_id: string; title: string; author: string; cover_url?: string | null; availability?: string; page?: number; total?: number };
const toBook = (s: Snap): Book => ({ id: s.book_id, title: s.title, author: s.author, cover_url: s.cover_url, availability: (s.availability || "READ ONLINE") as any,
  source_name: s.total ? `Page ${(s.page ?? 0) + 1} of ${s.total}` : "", source_id: "", description: "", isbn: [], publication_year: null, language: "", subjects: [], access_type: "", adult_content: false });

export default function ShelfScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, logout, updateProfile, ageConfirmed, revokeAge } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [tab, setTab] = useState<"saved" | "history" | "bookmarks">("history");
  const [saved, setSaved] = useState<Snap[]>([]);
  const [history, setHistory] = useState<Snap[]>([]);
  const [marks, setMarks] = useState<{ id: string; book_id: string; page: number; title: string; note: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [lang, setLang] = useState("English");
  const [favs, setFavs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const h = await continueReading(!!user);
      const s = user ? await api<Snap[]>("/me/saved").catch(() => []) : [];
      const b = user ? await api<any[]>("/me/bookmarks").catch(() => []) : await localBookmarks();
      if (live) { setHistory(h as Snap[]); setSaved(s); setMarks(b); setLoading(false); }
    })();
    return () => { live = false; };
  }, [user]));

  const startEdit = () => { setName(user?.name ?? ""); setLang(user?.preferred_language ?? "English"); setFavs(user?.favourite_categories ?? []); setEditing(true); };
  const saveProfile = async () => {
    if (!name.trim()) return toast("Display name cannot be empty", "error");
    setSaving(true);
    try { await updateProfile({ name: name.trim(), preferred_language: lang, favourite_categories: favs }); setEditing(false); toast("Profile updated", "success"); }
    catch (e) { toast(errMsg(e), "error"); } finally { setSaving(false); }
  };

  const list = tab === "saved" ? saved : tab === "history" ? history : [];
  const isStaff = user?.roles.some((r) => ["super_admin", "admin", "editor"].includes(r));

  return (
    <View style={styles.root} testID="shelf-screen">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: bottomChrome + space.xxl }}>
        <Eyebrow>My Shelf</Eyebrow>
        {user ? (
          <View style={styles.profile} testID="profile-card">
            <View style={styles.avatar}><Text style={styles.avatarText}>{(user.name || user.email).slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} testID="profile-name">{user.name || "Reader"}</Text>
              <Text style={styles.email} testID="profile-email">{user.email}</Text>
              <Text style={styles.email}>Reads in {user.preferred_language}{user.favourite_categories.length ? ` · loves ${user.favourite_categories.slice(0, 2).join(", ")}` : ""}</Text>
            </View>
            <Pressable testID="profile-edit-button" onPress={startEdit} hitSlop={10}><Icon name="edit-2" size={18} color={colors.muted} /></Pressable>
          </View>
        ) : (
          <View style={styles.guest} testID="guest-card">
            <Text style={styles.guestTitle}>Your reading, everywhere</Text>
            <Text style={styles.guestBody}>Browsing needs no account. Sign in to sync progress, bookmarks, saved books and reader settings across devices.</Text>
            <Button testID="shelf-signin-button" label="Sign in or create account" onPress={() => router.push("/auth")} style={{ marginTop: space.lg }} />
          </View>
        )}

        {editing && user && (
          <View style={styles.edit} testID="profile-edit-form">
            <Field testID="profile-name-input" label="Display name" value={name} onChangeText={setName} maxLength={60} />
            <Text style={styles.label}>Preferred language</Text>
            <View style={styles.wrap}>{LANGS.map((l) => <Chip key={l} testID={`profile-lang-${l.toLowerCase()}`} label={l} active={lang === l} onPress={() => setLang(l)} />)}</View>
            <Text style={[styles.label, { marginTop: space.lg }]}>Favourite categories</Text>
            <View style={styles.wrap}>{CATS.map((c) => <Chip key={c} testID={`profile-fav-${c}`} label={c} active={favs.includes(c)} onPress={() => setFavs(favs.includes(c) ? favs.filter((x) => x !== c) : [...favs, c])} />)}</View>
            <View style={{ flexDirection: "row", gap: space.md, marginTop: space.xl }}>
              <Button testID="profile-cancel" variant="secondary" label="Cancel" onPress={() => setEditing(false)} />
              <Button testID="profile-save" label="Save" loading={saving} onPress={saveProfile} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        <View style={styles.tabs}>
          {(["history", "saved", "bookmarks"] as const).map((t) => (
            <Pressable key={t} testID={`shelf-tab-${t}`} onPress={() => setTab(t)} style={[styles.tab, tab === t && { borderBottomColor: colors.onSurface }]}>
              <Text style={[styles.tabText, { color: tab === t ? colors.onSurface : colors.muted }]}>{t === "history" ? "Reading" : t === "saved" ? "Saved" : "Bookmarks"}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <StateView kind="loading" testID="shelf-loading" /> : tab === "bookmarks" ? (
          marks.length === 0 ? <StateView testID="shelf-empty" kind="empty" title="No bookmarks yet" body="Tap the bookmark icon while reading to keep your place." /> :
            marks.map((m, i) => (
              <Pressable key={m.id} testID={`bookmark-item-${i}`} style={styles.mark} onPress={() => router.push(`/read/${encodeURIComponent(m.book_id)}?page=${m.page}`)}>
                <Icon name="bookmark" size={16} color={colors.brandPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.markTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.email}>Page {m.page + 1}{m.note ? ` · ${m.note}` : ""}</Text>
                </View>
              </Pressable>
            ))
        ) : list.length === 0 ? (
          <StateView testID="shelf-empty" kind="empty" title={tab === "saved" ? (user ? "Your shelf is empty" : "Sign in to save books") : "Nothing read yet"} body="Start exploring the library." />
        ) : list.map((s, i) => (
          <BookRow key={s.book_id} book={toBook(s)} testID={`shelf-item-${i}`} onPress={() => router.push(tab === "history" ? `/read/${encodeURIComponent(s.book_id)}` : `/book/${encodeURIComponent(s.book_id)}`)} />
        ))}

        <View style={styles.links}>
          <LinkRow testID="shelf-after-dark" icon="moon" label="OpenBook After Dark — 18+" onPress={() => router.push("/after-dark")} />
          {ageConfirmed && <LinkRow testID="shelf-revoke-age" icon="eye-off" label="Forget my 18+ confirmation" onPress={async () => { await revokeAge(); toast("18+ confirmation removed from this device"); }} />}
          <LinkRow testID="shelf-submit" icon="upload" label="Submit a book" onPress={() => router.push("/submit")} />
          <LinkRow testID="shelf-help" icon="help-circle" label="Help Centre" onPress={() => router.push("/info/help")} />
          {isStaff && <LinkRow testID="shelf-admin" icon="shield" label="Admin dashboard" onPress={() => router.push("/admin")} />}
          {user && <LinkRow testID="shelf-signout" icon="log-out" label="Sign out" onPress={async () => { await logout(); toast("Signed out"); }} />}
        </View>
      </ScrollView>
    </View>
  );
}

function LinkRow({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.linkRow}>
      <Icon name={icon} size={18} color={colors.brandPrimary} />
      <Text style={styles.linkText}>{label}</Text>
      <Icon name="chevron-right" size={16} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  profile: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.brandPrimary },
  avatarText: { fontFamily: fonts.display, fontSize: 28, color: c.onBrandTertiary },
  name: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  email: { fontFamily: fonts.body, fontSize: 13, color: c.muted, marginTop: 2 },
  guest: { marginTop: space.lg, padding: space.xl, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  guestTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  guestBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.muted, marginTop: space.sm },
  edit: { marginTop: space.xl, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: c.border },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: c.muted, marginBottom: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tabs: { flexDirection: "row", gap: space.xl, marginTop: space.xxl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  tab: { paddingVertical: space.md, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" },
  mark: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  markTitle: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  links: { marginTop: space.xxl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  linkRow: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider },
  linkText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: c.onSurface },
}));
