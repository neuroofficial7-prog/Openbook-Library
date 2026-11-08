import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Book, qs } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { Bookshelf3D } from "@/src/components/Bookshelf3D";
import { BookRow, CoverGridItem } from "@/src/components/ShelfRow";
import { Button, Checkbox, Chip, Eyebrow, Icon, IconButton, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { clearRecentSearches, pushRecentSearch, recentSearches } from "@/src/reader-store";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

const FIELDS = [["any", "Everything"], ["title", "Title"], ["author", "Author"], ["isbn", "ISBN"], ["subject", "Subject / Genre"], ["publisher", "Publisher"]] as const;
const SOURCES = [["gutenberg", "Project Gutenberg"], ["openlibrary", "Open Library"], ["ia", "Internet Archive"], ["doab", "Open-access academic (DOAB)"], ["local", "OpenBook submissions"]] as const;
const AVAILS = ["READ ONLINE", "READ AT SOURCE", "BORROW TO READ", "METADATA ONLY", "NOT CURRENTLY AVAILABLE"];
const LANGS = ["English", "Mizo", "French", "German", "Spanish", "Italian", "Portuguese", "Hindi", "Latin"];
const CATS = [["fiction", "Fiction"], ["romance", "Romance"], ["mystery", "Mystery"], ["fantasy", "Fantasy"], ["science-fiction", "Science Fiction"], ["history", "History"], ["biography", "Biography"], ["philosophy", "Philosophy"], ["poetry", "Poetry"], ["religion", "Religion"], ["children", "Children's"]] as const;

type Filters = { sources: string[]; language: string; year_from: string; year_to: string; availability: string[]; category: string; adult: boolean };
const EMPTY: Filters = { sources: SOURCES.map((s) => s[0]), language: "", year_from: "", year_to: "", availability: [], category: "", adult: false };
type Result = { results: Book[]; total: number; sources: { name: string; ok: boolean; error?: string }[] };

export default function SearchScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { ageConfirmed } = useAuth();
  const params = useLocalSearchParams<{ q?: string }>();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [text, setText] = useState(params.q ?? "");
  const [field, setField] = useState<string>("any");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"grid" | "list" | "shelf">("list");
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<{ searches: string[]; books: Book[]; authors: string[] } | null>(null);

  useEffect(() => {
    recentSearches().then(setRecent);
    api("/search/popular").then(setPopular).catch(() => {});
  }, []);

  const run = useCallback(async (q: string, f: Filters = filters, fld: string = field) => {
    if (!q.trim() && !f.category) return;
    setLoading(true);
    setError("");
    try {
      const r = await api<Result>(`/search?${qs({
        q: q.trim(), field: fld, sources: f.sources.join(","), language: f.language, year_from: f.year_from, year_to: f.year_to,
        availability: f.availability.join(","), category: f.category, adult: f.adult && ageConfirmed ? "true" : undefined,
      })}`);
      setData(r);
      if (q.trim()) {
        await pushRecentSearch(q.trim());
        setRecent(await recentSearches());
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, field, ageConfirmed]);

  useEffect(() => {
    if (params.q) { setText(params.q); run(params.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  const pick = (q: string) => { setText(q); run(q); };
  const open = (b: Book) => router.push(`/book/${encodeURIComponent(b.id)}`);
  const activeCount = (filters.language ? 1 : 0) + (filters.year_from || filters.year_to ? 1 : 0) + (filters.availability.length ? 1 : 0)
    + (filters.category ? 1 : 0) + (filters.sources.length !== SOURCES.length ? 1 : 0) + (filters.adult ? 1 : 0);
  const gridW = (width - space.xl * 2 - space.lg * 2) / 3;
  const suggestions = text.length >= 2 ? [...recent, ...(popular?.searches ?? []), ...(popular?.authors ?? [])].filter((s, i, a) => s.toLowerCase().includes(text.toLowerCase()) && s.toLowerCase() !== text.toLowerCase() && a.indexOf(s) === i).slice(0, 4) : [];

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <View style={styles.root} testID="search-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <Eyebrow>Unified discovery</Eyebrow>
        <Text style={styles.title}>Search the world&apos;s open shelves</Text>
        <View style={styles.inputWrap}>
          <Icon name="search" color={colors.muted} />
          <TextInput testID="search-input" value={text} onChangeText={setText} placeholder="Title, author, ISBN, subject…" placeholderTextColor={colors.muted}
            style={styles.input} returnKeyType="search" onSubmitEditing={() => run(text)} autoCorrect={false} />
          {!!text && <IconButton testID="search-clear" name="x" size={18} color={colors.muted} onPress={() => { setText(""); setData(null); }} />}
          <IconButton testID="search-filter-button" name="sliders" size={18} onPress={() => { setDraft(filters); setShowFilters(true); }} />
          {activeCount > 0 && <View style={styles.dot}><Text style={styles.dotText}>{activeCount}</Text></View>}
        </View>
        {suggestions.length > 0 && (
          <View style={styles.suggest}>
            {suggestions.map((s, i) => (
              <Pressable key={s} testID={`search-suggestion-${i}`} onPress={() => pick(s)} style={styles.suggestRow}>
                <Icon name="corner-down-right" size={14} color={colors.muted} /><Text style={styles.suggestText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowInner}>
          {FIELDS.map(([k, l]) => <Chip key={k} testID={`search-field-${k}`} label={l} active={field === k} onPress={() => { setField(k); if (text.trim()) run(text, filters, k); }} />)}
        </ScrollView>
      </View>

      {!data && !loading && !error && (
        <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: bottomChrome + space.xxl }} keyboardShouldPersistTaps="handled">
          {recent.length > 0 && (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.blockTitle}>Recent searches</Text>
                <Pressable testID="clear-recent" onPress={async () => { await clearRecentSearches(); setRecent([]); }}><Text style={styles.link}>Clear</Text></Pressable>
              </View>
              <View style={styles.wrap}>{recent.map((r, i) => <Chip key={r} testID={`recent-search-${i}`} label={r} onPress={() => pick(r)} />)}</View>
            </>
          )}
          {!!popular?.searches.length && (
            <>
              <Text style={styles.blockTitle}>Popular searches</Text>
              <View style={styles.wrap}>{popular.searches.map((r, i) => <Chip key={r} testID={`popular-search-${i}`} label={r} onPress={() => pick(r)} />)}</View>
            </>
          )}
          {!!popular?.authors.length && (
            <>
              <Text style={styles.blockTitle}>Popular authors</Text>
              <View style={styles.wrap}>{popular.authors.map((a, i) => <Chip key={a} testID={`popular-author-${i}`} label={a} onPress={() => { setField("author"); setText(a); run(a, filters, "author"); }} />)}</View>
            </>
          )}
          {!!popular?.books.length && (
            <>
              <Text style={styles.blockTitle}>Popular books</Text>
              {popular.books.map((b, i) => <BookRow key={b.id} book={b} testID={`popular-book-${i}`} onPress={() => open(b)} />)}
            </>
          )}
        </ScrollView>
      )}

      {loading && <StateView testID="search-loading" kind="loading" title="Searching the archives…" body="Asking Project Gutenberg, Open Library, Internet Archive and DOAB." />}
      {!!error && !loading && <StateView testID="search-error" kind="error" title="Error querying the libraries" body={error} onRetry={() => run(text)} />}

      {data && !loading && !error && (
        <>
          <View style={styles.resultBar}>
            <Text testID="search-result-count" style={styles.count}>{data.total} volumes</Text>
            <View style={{ flexDirection: "row" }}>
              {(["list", "grid", "shelf"] as const).map((v) => (
                <IconButton key={v} testID={`view-${v}`} name={v === "list" ? "list" : v === "grid" ? "grid" : "book"} size={18}
                  color={view === v ? colors.onSurface : colors.borderStrong} onPress={() => setView(v)} />
              ))}
            </View>
          </View>
          {data.sources.some((s) => !s.ok) && (
            <Text testID="search-source-warning" style={styles.warn}>
              Unreachable right now: {data.sources.filter((s) => !s.ok).map((s) => s.name).join(", ")}. Results from other sources are shown.
            </Text>
          )}
          {data.results.length === 0 ? (
            <StateView testID="search-empty" kind="empty" title="No volumes found" body="Try a different spelling, fewer filters, or another field." />
          ) : view === "shelf" ? (
            <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + space.xxl }}><Bookshelf3D testID="search-shelf" books={data.results.slice(0, 30)} /></ScrollView>
          ) : (
            <FlatList
              key={view}
              data={data.results}
              numColumns={view === "grid" ? 3 : 1}
              keyExtractor={(b) => b.id}
              columnWrapperStyle={view === "grid" ? { gap: space.lg } : undefined}
              contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: bottomChrome + space.xxl }}
              renderItem={({ item, index }) => view === "grid"
                ? <CoverGridItem book={item} width={gridW} testID={`search-result-${index}`} onPress={() => open(item)} />
                : <BookRow book={item} testID={`search-result-${index}`} onPress={() => open(item)} />}
            />
          )}
        </>
      )}

      <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} testID="filter-sheet">
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>Refine</Text>
              <IconButton testID="filter-close" name="x" onPress={() => setShowFilters(false)} />
            </View>
            <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.blockTitle}>Sources</Text>
              <View style={styles.wrap}>{SOURCES.map(([k, l]) => <Chip key={k} testID={`filter-source-${k}`} label={l} active={draft.sources.includes(k)} onPress={() => setDraft({ ...draft, sources: toggle(draft.sources, k) })} />)}</View>
              <Text style={styles.blockTitle}>Availability</Text>
              <View style={styles.wrap}>{AVAILS.map((a) => <Chip key={a} testID={`filter-avail-${a.replace(/ /g, "-").toLowerCase()}`} label={a} active={draft.availability.includes(a)} onPress={() => setDraft({ ...draft, availability: toggle(draft.availability, a) })} />)}</View>
              <Text style={styles.blockTitle}>Language</Text>
              <View style={styles.wrap}>{LANGS.map((l) => <Chip key={l} testID={`filter-lang-${l.toLowerCase()}`} label={l} active={draft.language === l} onPress={() => setDraft({ ...draft, language: draft.language === l ? "" : l })} />)}</View>
              <Text style={styles.blockTitle}>Category</Text>
              <View style={styles.wrap}>{CATS.map(([k, l]) => <Chip key={k} testID={`filter-cat-${k}`} label={l} active={draft.category === k} onPress={() => setDraft({ ...draft, category: draft.category === k ? "" : k })} />)}</View>
              <Text style={styles.blockTitle}>Publication year</Text>
              <View style={{ flexDirection: "row", gap: space.md }}>
                <TextInput testID="filter-year-from" value={draft.year_from} onChangeText={(v) => setDraft({ ...draft, year_from: v.replace(/\D/g, "").slice(0, 4) })} placeholder="From" keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.yearInput} />
                <TextInput testID="filter-year-to" value={draft.year_to} onChangeText={(v) => setDraft({ ...draft, year_to: v.replace(/\D/g, "").slice(0, 4) })} placeholder="To" keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.yearInput} />
              </View>
              {ageConfirmed && (
                <View style={{ marginTop: space.lg }}>
                  <Checkbox testID="filter-adult" checked={draft.adult} onToggle={() => setDraft({ ...draft, adult: !draft.adult })} label="Include 18+ After Dark results" />
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: space.md, marginTop: space.lg }}>
              <Button testID="filter-reset" variant="secondary" label="Reset" onPress={() => setDraft(EMPTY)} />
              <Button testID="filter-apply" label="Apply" style={{ flex: 1 }} onPress={() => {
                const f = draft.sources.length ? draft : { ...draft, sources: EMPTY.sources };
                setFilters(f); setShowFilters(false); if (text.trim() || f.category) run(text, f);
              }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: space.xl, backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: c.onSurface, marginTop: 4, marginBottom: space.lg },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1.5, borderBottomColor: c.onSurface, paddingBottom: 2 },
  input: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: c.onSurface, minHeight: 48 },
  dot: { position: "absolute", right: 4, top: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  dotText: { fontFamily: fonts.bold, fontSize: 10, color: c.onBrandPrimary },
  suggest: { paddingVertical: space.xs },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  suggestText: { fontFamily: fonts.body, fontSize: 15, color: c.onSurface },
  chipRow: { height: 56, flexGrow: 0, marginHorizontal: -space.xl },
  chipRowInner: { paddingHorizontal: space.xl, gap: space.sm, alignItems: "center" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  blockTitle: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: c.muted, marginTop: space.xl, marginBottom: space.md },
  link: { fontFamily: fonts.medium, fontSize: 13, color: c.brandPrimary, marginTop: space.xl, marginBottom: space.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  resultBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.xl, paddingTop: space.sm },
  count: { fontFamily: fonts.displayItalic, fontSize: 16, color: c.muted },
  warn: { fontFamily: fonts.body, fontSize: 12, color: c.warning, paddingHorizontal: space.xl, paddingBottom: space.sm },
  sheetBackdrop: { flex: 1, backgroundColor: c.scrim, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  yearInput: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: c.onSurface, backgroundColor: c.surfaceSecondary },
}));
