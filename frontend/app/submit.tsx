import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Button, Checkbox, Chip, Eyebrow, Field, IconButton, StateView, errMsg } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";
import { useToast } from "@/src/toast";

const ROLES = [["author", "Author"], ["publisher", "Publisher"], ["rights_holder", "Rights holder"], ["contributor", "Approved contributor"]] as const;
const LANGS = ["Mizo", "English", "Hindi", "Other"];

export default function SubmitScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [f, setF] = useState({ title: "", author: "", description: "", isbn: "", publication_year: "", language: "Mizo", category: "", publisher: "", reading_url: "", licence: "", content_text: "" });
  const [role, setRole] = useState<string>("author");
  const [perm, setPerm] = useState(false);
  const [adult, setAdult] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ duplicate_of: string | null } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = "Title is required";
    if (!f.author.trim()) e.author = "Author is required";
    if (f.licence.trim().length < 2) e.licence = "State the licence or permission (e.g. CC BY 4.0, “All rights reserved – permission granted to OpenBook”)";
    if (f.publication_year && !/^\d{4}$/.test(f.publication_year)) e.publication_year = "Use a 4-digit year";
    if (f.isbn && !/^[\dXx-]{10,17}$/.test(f.isbn)) e.isbn = "ISBN looks invalid";
    if (f.reading_url && !/^https?:\/\/\S+\.\S+/.test(f.reading_url)) e.reading_url = "Must start with http:// or https://";
    if (!perm) e.perm = "You must declare ownership or permission";
    setErrors(e);
    if (Object.keys(e).length) return toast("Please fix the highlighted fields", "error");
    setBusy(true);
    try {
      const r = await api<{ duplicate_of: string | null }>("/submissions", { method: "POST", body: {
        ...f, isbn: f.isbn.replace(/-/g, ""), publication_year: f.publication_year ? Number(f.publication_year) : null, reading_url: f.reading_url || null,
        contributor_role: role, permission_declared: perm, adult_content: adult } });
      setDone(r);
    } catch (err) { toast(errMsg(err), "error"); } finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="submit-screen">
      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="submit-back-button" name="arrow-left" onPress={back} />
      </View>
      {!user ? (
        <StateView testID="submit-signin-required" kind="empty" title="Sign in to submit a book" body="Submissions are linked to your account so the library team can contact you during review." onRetry={() => router.push("/auth")} />
      ) : done ? (
        <View style={{ padding: space.xl }} testID="submit-success">
          <Eyebrow>Submission received</Eyebrow>
          <Text style={styles.title}>Thank you.</Text>
          <Text style={styles.sub}>Your book is now in the review queue. It will not be published until an administrator checks the details and your permission declaration.</Text>
          {done.duplicate_of && <Text style={styles.warn} testID="submit-duplicate-warning">A similar record already exists in the library; the reviewer will compare them.</Text>}
          <Button testID="submit-done-button" label="Back to the library" onPress={() => router.replace("/")} style={{ marginTop: space.xl }} />
        </View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }}>
          <Eyebrow>Contribute</Eyebrow>
          <Text style={styles.title}>Submit a Book</Text>
          <Text style={styles.sub}>For authors, publishers and rights holders — especially Mizo writers. Every submission is reviewed; nothing is published automatically.</Text>
          <Field testID="submit-title-input" label="Title *" value={f.title} onChangeText={set("title")} error={errors.title} />
          <Field testID="submit-author-input" label="Author *" value={f.author} onChangeText={set("author")} error={errors.author} />
          <Field testID="submit-description-input" label="Description" value={f.description} onChangeText={set("description")} multiline maxLength={3000} />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ flex: 1 }}><Field testID="submit-year-input" label="Year" value={f.publication_year} onChangeText={set("publication_year")} keyboardType="number-pad" maxLength={4} error={errors.publication_year} /></View>
            <View style={{ flex: 1.4 }}><Field testID="submit-isbn-input" label="ISBN" value={f.isbn} onChangeText={set("isbn")} error={errors.isbn} /></View>
          </View>
          <Text style={styles.label}>Language</Text>
          <View style={styles.wrap}>{LANGS.map((l) => <Chip key={l} testID={`submit-lang-${l.toLowerCase()}`} label={l} active={f.language === l} onPress={() => set("language")(l)} />)}</View>
          <Field testID="submit-category-input" label="Category" value={f.category} onChangeText={set("category")} placeholder="e.g. Mizo Poetry, Folklore, History" />
          <Field testID="submit-publisher-input" label="Publisher" value={f.publisher} onChangeText={set("publisher")} />
          <Field testID="submit-url-input" label="Online reading URL (optional)" value={f.reading_url} onChangeText={set("reading_url")} autoCapitalize="none" error={errors.reading_url} />
          <Field testID="submit-text-input" label="Full text to host (optional, only with rights)" value={f.content_text} onChangeText={set("content_text")} multiline maxLength={400000} placeholder="Paste the book text if you permit OpenBook to host it for online reading." />
          <Field testID="submit-licence-input" label="Licence / permission *" value={f.licence} onChangeText={set("licence")} error={errors.licence} />
          <Text style={styles.label}>I am the</Text>
          <View style={styles.wrap}>{ROLES.map(([k, l]) => <Chip key={k} testID={`submit-role-${k}`} label={l} active={role === k} onPress={() => setRole(k)} />)}</View>
          <View style={{ marginTop: space.lg }}>
            <Checkbox testID="submit-adult-checkbox" checked={adult} onToggle={() => setAdult(!adult)} label="This book contains adult (18+) content" />
            <Checkbox testID="submit-permission-checkbox" checked={perm} onToggle={() => setPerm(!perm)} label="I declare that I own this work or have permission to distribute it through OpenBook Library." />
            {!!errors.perm && <Text style={styles.err}>{errors.perm}</Text>}
          </View>
          <Button testID="submit-send-button" label="Send for review" loading={busy} onPress={submit} style={{ marginTop: space.xl }} />
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: space.sm },
  title: { fontFamily: fonts.display, fontSize: 34, color: c.onSurface, marginTop: space.sm },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.muted, marginTop: space.sm, marginBottom: space.xl },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: c.muted, marginBottom: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  err: { fontFamily: fonts.body, fontSize: 12, color: c.error },
  warn: { fontFamily: fonts.body, fontSize: 13, color: c.warning, marginTop: space.lg },
}));
