import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdmin } from "@/src/admin-context";
import { api } from "@/src/api";
import { AdminHeader } from "@/src/components/AdminHeader";
import { Button, Checkbox, Chip, Field, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";
import { useToast } from "@/src/toast";

const FORMATS = ["text", "pdf", "epub", "html", "none"];
const ACCESS = [["hosted_text", "Hosted text (read online)"], ["external_reader", "External reader"], ["borrow", "Borrow only"], ["metadata", "Metadata only"], ["unavailable", "Not available"]] as const;
const COPY = [["public_domain", "Public domain"], ["open_licence", "Open licence"], ["permission_granted", "Permission granted"], ["copyrighted", "Copyrighted"], ["unknown", "Unknown"]] as const;
const CATEGORIES = ["Fiction", "Non-fiction", "Romance", "Mystery", "Thriller", "Fantasy", "Science Fiction", "History", "Biography", "Philosophy", "Poetry", "Education", "Religion", "Academic Books", "Children's Literature",
  "Mizo Literature", "Mizo History", "Mizo Folklore", "Mizo Poetry", "Mizo Novels", "Adult Fiction", "Mature Romance", "Erotic Literature", "Mature Historical Fiction", "Psychological Fiction", "Adult Literary Fiction"];

const EMPTY = { title: "", author: "", description: "", isbn: "", publication_year: "", language: "English", country: "", genre: "", category: "", publisher: "", cover_url: "",
  format: "text", source_url: "", reader_url: "", licence: "", copyright_status: "unknown", access_type: "metadata", adult_content: false, content_text: "", publication_status: "draft" };

export default function AdminEdit() {
  const styles = useStyles();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { admin, can } = useAdmin();
  const [f, setF] = useState<typeof EMPTY>(EMPTY);
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id || !admin) return;
    api<any>(`/admin/books/${id}`, { admin: true }).then((b) => {
      setF({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, b[k] ?? (EMPTY as any)[k]])), isbn: (b.isbn || []).join(", "), publication_year: b.publication_year ? String(b.publication_year) : "" } as any);
    }).catch((e) => toast(errMsg(e), "error")).finally(() => setLoading(false));
  }, [id, admin, toast]);

  if (!admin) return <StateView testID="admin-required" kind="error" title="Admin sign-in required" onRetry={() => router.replace("/admin")} />;
  if (loading) return <StateView testID="admin-edit-loading" kind="loading" />;

  const set = (k: keyof typeof EMPTY) => (v: any) => setF({ ...f, [k]: v });
  const urlOk = (u: string) => !u || /^https?:\/\/\S+\.\S+/.test(u);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "Required";
    if (!f.author.trim()) e.author = "Required";
    if (f.licence.trim().length < 2) e.licence = "Record the licence or rights statement";
    if (f.publication_year && !/^\d{4}$/.test(f.publication_year)) e.publication_year = "4-digit year";
    (["cover_url", "source_url", "reader_url"] as const).forEach((k) => { if (!urlOk(f[k] as string)) e[k] = "Must be an http(s) URL"; });
    if (f.access_type === "hosted_text" && !f.content_text.trim()) e.content_text = "Hosted text needs the book text (only when you hold the rights)";
    if (f.access_type === "hosted_text" && !["public_domain", "open_licence", "permission_granted"].includes(f.copyright_status)) e.copyright_status = "Hosting requires public domain, open licence or permission";
    setErrors(e);
    if (Object.keys(e).length) return toast("Please fix the highlighted fields", "error");
    setBusy(true);
    const body = { ...f, isbn: f.isbn.split(",").map((s) => s.trim()).filter(Boolean), publication_year: f.publication_year ? Number(f.publication_year) : null,
      cover_url: f.cover_url || null, source_url: f.source_url || null, reader_url: f.reader_url || null };
    try {
      if (id) await api(`/admin/books/${id}`, { method: "PUT", body, admin: true });
      else await api("/admin/books", { method: "POST", body, admin: true });
      toast(id ? "Book updated" : "Book created", "success");
      router.back();
    } catch (err) { toast(errMsg(err), "error"); } finally { setBusy(false); }
  };

  const Opts = ({ label, value, options, onChange, err, tid }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void; err?: string; tid: string }) => (
    <View style={{ marginBottom: space.lg }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>{options.map(([k, l]) => <Chip key={k} testID={`${tid}-${k}`} label={l} active={value === k} onPress={() => onChange(k)} />)}</View>
      {!!err && <Text style={styles.err}>{err}</Text>}
    </View>
  );

  return (
    <View style={styles.root} testID="admin-edit-screen">
      <AdminHeader title={id ? "Edit book" : "Add a book"} eyebrow="Book management" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingBottom: insets.bottom + space.xxl }}>
        <Field testID="edit-title" label="Title *" value={f.title} onChangeText={set("title")} error={errors.title} />
        <Field testID="edit-author" label="Author *" value={f.author} onChangeText={set("author")} error={errors.author} />
        <Field testID="edit-description" label="Description" value={f.description} onChangeText={set("description")} multiline />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1.4 }}><Field testID="edit-isbn" label="ISBN (comma separated)" value={f.isbn} onChangeText={set("isbn")} /></View>
          <View style={{ flex: 1 }}><Field testID="edit-year" label="Year" value={f.publication_year} onChangeText={set("publication_year")} keyboardType="number-pad" maxLength={4} error={errors.publication_year} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}><Field testID="edit-language" label="Language" value={f.language} onChangeText={set("language")} /></View>
          <View style={{ flex: 1 }}><Field testID="edit-country" label="Country" value={f.country} onChangeText={set("country")} /></View>
        </View>
        <Field testID="edit-genre" label="Genre" value={f.genre} onChangeText={set("genre")} />
        <Opts tid="edit-category" label="Category" value={f.category} options={CATEGORIES.map((c) => [c, c] as const)} onChange={set("category")} />
        <Field testID="edit-publisher" label="Publisher" value={f.publisher} onChangeText={set("publisher")} />
        <Field testID="edit-cover" label="Cover image URL" value={f.cover_url} onChangeText={set("cover_url")} autoCapitalize="none" error={errors.cover_url} />
        <Opts tid="edit-format" label="Format" value={f.format} options={FORMATS.map((x) => [x, x.toUpperCase()] as const)} onChange={set("format")} />
        <Field testID="edit-source-url" label="Source URL" value={f.source_url} onChangeText={set("source_url")} autoCapitalize="none" error={errors.source_url} />
        <Field testID="edit-reader-url" label="Reading URL" value={f.reader_url} onChangeText={set("reader_url")} autoCapitalize="none" error={errors.reader_url} />
        <Field testID="edit-licence" label="Licence *" value={f.licence} onChangeText={set("licence")} error={errors.licence} />
        <Opts tid="edit-copyright" label="Copyright status" value={f.copyright_status} options={COPY} onChange={set("copyright_status")} err={errors.copyright_status} />
        <Opts tid="edit-access" label="Access type" value={f.access_type} options={ACCESS} onChange={set("access_type")} />
        {f.access_type === "hosted_text" && (
          <Field testID="edit-content" label="Book text (hosted with rights)" value={f.content_text} onChangeText={set("content_text")} multiline error={errors.content_text} style={{ minHeight: 160 }} />
        )}
        <Checkbox testID="edit-adult" checked={f.adult_content} onToggle={() => set("adult_content")(!f.adult_content)} label="Adult content (18+) — shown only in After Dark" />
        <View style={{ marginTop: space.lg }}>
          <Opts tid="edit-status" label="Publication status" value={f.publication_status}
            options={(can("super_admin", "admin") ? [["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]] : [["draft", "Draft"]]) as any} onChange={set("publication_status")} />
        </View>
        <Button testID="edit-save" label={id ? "Save changes" : "Create book"} loading={busy} onPress={save} />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: c.muted, marginBottom: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  err: { fontFamily: fonts.body, fontSize: 12, color: c.error, marginTop: 4 },
}));
