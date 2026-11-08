import React, { useCallback, useEffect, useState } from "react";
import { FlatList, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Book, qs } from "@/src/api";
import { Bookshelf3D } from "@/src/components/Bookshelf3D";
import { PuanBand } from "@/src/components/PuanBand";
import { BookRow } from "@/src/components/ShelfRow";
import { Button, Chip, Eyebrow, Icon, IconButton, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

const COLLECTIONS = [
  ["literature", "Literature"], ["history", "History"], ["folklore", "Folklore"], ["traditional", "Traditional Stories"], ["poetry", "Poetry"],
  ["short-stories", "Short Stories"], ["novels", "Novels"], ["religious", "Religious"], ["educational", "Educational"], ["cultural", "Cultural Heritage"],
  ["language", "Language Learning"], ["documents", "Historical Documents"],
] as const;

type Res = { name: string; books: Book[]; authors: string[]; sources: string[]; note: string };

export default function MizoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [collection, setCollection] = useState("literature");
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState("");
  const [yf, setYf] = useState("");
  const [yt, setYt] = useState("");
  const [data, setData] = useState<Res | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (col = collection, query = q, au = author) => {
    setLoading(true);
    setError("");
    try {
      setData(await api<Res>(`/mizo?${qs({ collection: col, q: query.trim(), author: au, year_from: yf.length === 4 ? yf : "", year_to: yt.length === 4 ? yt : "" })}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [collection, q, author, yf, yt]);

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, author]);

  const header = (
    <View>
      <View style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
        <Eyebrow color={colors.mizo}>Lehkhabu · Thawnthu · Hla</Eyebrow>
        <Text style={styles.title} testID="mizo-title">MIZO HERITAGE{"\n"}LIBRARY</Text>
        <Text style={styles.sub}>Lehkhabu, thawnthu, hla leh chanchin — Mizo books, history, folklore and poetry gathered from legitimate open archives.</Text>
        <View style={styles.inputWrap}>
          <Icon name="search" color={colors.muted} />
          <TextInput testID="mizo-search-input" value={q} onChangeText={setQ} placeholder="Zawng rawh… (search in Mizo or English)" placeholderTextColor={colors.muted}
            style={styles.input} returnKeyType="search" onSubmitEditing={() => load()} autoCorrect={false} />
          <IconButton testID="mizo-search-submit" name="arrow-right" onPress={() => load()} />
        </View>
        <View style={styles.yearRow}>
          <Text style={styles.yearLabel}>Published</Text>
          <TextInput testID="mizo-year-from" value={yf} onChangeText={(v) => setYf(v.replace(/\D/g, "").slice(0, 4))} placeholder="from" keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.yearInput} />
          <TextInput testID="mizo-year-to" value={yt} onChangeText={(v) => setYt(v.replace(/\D/g, "").slice(0, 4))} placeholder="to" keyboardType="number-pad" placeholderTextColor={colors.muted} style={styles.yearInput} onSubmitEditing={() => load()} />
          <Button testID="mizo-year-apply" label="Apply" variant="secondary" onPress={() => load()} style={{ minHeight: 40, paddingHorizontal: 14 }} />
        </View>
      </View>
      <PuanBand />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowInner}>
        {COLLECTIONS.map(([k, l]) => <Chip key={k} testID={`mizo-collection-${k}`} label={l} active={collection === k} onPress={() => setCollection(k)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.root} testID="mizo-screen">
      <FlatList
        data={loading || error ? [] : data?.books ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingBottom: bottomChrome + space.xxl }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            {loading && <StateView testID="mizo-loading" kind="loading" title="Opening the archive…" />}
            {!!error && <StateView testID="mizo-error" kind="error" title="Could not reach the archives" body={error} onRetry={() => load()} />}
            {!loading && !error && data && (
              <>
                <View style={styles.collHead}>
                  <Text style={styles.collTitle}>{data.name}</Text>
                  <Text style={styles.collMeta} testID="mizo-count">{data.books.length} records · {data.sources.join(" · ")}</Text>
                </View>
                {data.books.length > 0 && <Bookshelf3D testID="mizo-shelf3d" books={data.books.slice(0, 20)} />}
                {data.authors.length > 0 && (
                  <>
                    <Text style={styles.block}>Browse by author</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowInner}>
                      {author ? <Chip testID="mizo-author-clear" label={`✕  ${author}`} active onPress={() => setAuthor("")} /> : null}
                      {data.authors.filter((a) => a !== author).map((a, i) => <Chip key={a} testID={`mizo-author-${i}`} label={a} onPress={() => setAuthor(a)} />)}
                    </ScrollView>
                  </>
                )}
                {data.books.length === 0 && <StateView testID="mizo-empty" kind="empty" title="No records found" body="No source currently lists a matching Mizo title. Try another collection or spelling." />}
                {data.books.length > 0 && <Text style={styles.block}>All records</Text>}
              </>
            )}
          </>
        }
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: space.xl }}>
            <BookRow book={item} testID={`mizo-result-${index}`} onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)} />
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            {!!data?.note && <Text style={styles.note}>{data.note}</Text>}
            <View style={styles.submitCard}>
              <Text style={styles.submitTitle}>Are you a Mizo author or publisher?</Text>
              <Text style={styles.note}>Submit your book with a permission or licence declaration. Every submission is reviewed before publishing.</Text>
              <Button testID="mizo-submit-button" label="Submit a book" icon="upload" onPress={() => router.push("/submit")} style={{ marginTop: space.md }} />
            </View>
          </View>
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { paddingHorizontal: space.xl, paddingBottom: space.xl, backgroundColor: c.mizoTint },
  title: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: 1, color: c.onSurface, marginTop: space.sm },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.onSurface, opacity: 0.8, marginTop: space.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, borderBottomWidth: 1.5, borderBottomColor: c.mizo, marginTop: space.lg },
  input: { flex: 1, fontFamily: fonts.display, fontSize: 17, color: c.onSurface, minHeight: 48 },
  yearRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  yearLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: c.muted },
  yearInput: { width: 70, minHeight: 40, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, paddingHorizontal: 10, fontFamily: fonts.body, fontSize: 14, color: c.onSurface, backgroundColor: c.surface },
  chipRow: { height: 56, flexGrow: 0 },
  chipRowInner: { paddingHorizontal: space.xl, gap: space.sm, alignItems: "center" },
  collHead: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg },
  collTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  collMeta: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 4 },
  block: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: c.muted, paddingHorizontal: space.xl, marginTop: space.xl },
  footer: { paddingHorizontal: space.xl, paddingTop: space.xl },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: c.muted },
  submitCard: { marginTop: space.xl, padding: space.xl, borderRadius: radius.md, borderWidth: 1, borderColor: c.mizo, borderLeftWidth: 4 },
  submitTitle: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, marginBottom: space.sm },
}));
