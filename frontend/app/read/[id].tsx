import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
type ViewToken = { item: unknown };
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather } from "@react-native-vector-icons/feather";

import { api, Book } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { StateView } from "@/src/components/ui";
import {
  DEFAULT_SETTINGS, LINE_HEIGHT, localBookmarks, localProgressAll, MARGIN, MAX_WIDTH, READER_THEMES, ReaderSettings,
  loadSettings, saveProgress, saveSettings, setLocalBookmarks,
} from "@/src/reader-store";
import { fonts, radius, space } from "@/src/theme";
import { useToast } from "@/src/toast";

type Meta = { book: Book; total: number; toc: { title: string; page: number }[] };
type Mark = { id: string; page: number; note: string; title: string };
const CHUNK = 8;

export default function Reader() {
  const { id, page: pageParam } = useLocalSearchParams<{ id: string; page?: string }>();
  const bookId = decodeURIComponent(String(id));
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<Record<number, string>>({});
  const [page, setPage] = useState(0);
  const [s, setS] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [chrome, setChrome] = useState(true);
  const [focus, setFocus] = useState(false);
  const [full, setFull] = useState(false);
  const [panel, setPanel] = useState<null | "settings" | "toc">(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const loading = useRef(new Set<number>());
  const scrollRef = useRef<any>(null);
  const listRef = useRef<FlatList>(null);
  const th = READER_THEMES[s.theme];
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) setPage(viewableItems[0].item as number);
  });

  const fetchChunk = useCallback(async (start: number) => {
    const c = Math.floor(start / CHUNK) * CHUNK;
    if (loading.current.has(c)) return;
    loading.current.add(c);
    try {
      const r = await api<{ start: number; pages: string[] }>(`/read/${encodeURIComponent(bookId)}/pages?start=${c}&count=${CHUNK}`);
      setPages((p) => { const n = { ...p }; r.pages.forEach((t, i) => (n[c + i] = t)); return n; });
    } catch { loading.current.delete(c); }
  }, [bookId]);

  const loadMarks = useCallback(async () => {
    if (user) setMarks(await api<Mark[]>(`/me/bookmarks?book_id=${encodeURIComponent(bookId)}`).catch(() => []));
    else setMarks((await localBookmarks()).filter((m) => m.book_id === bookId));
  }, [user, bookId]);

  useEffect(() => {
    (async () => {
      try {
        const [m, st, local] = await Promise.all([api<Meta>(`/read/${encodeURIComponent(bookId)}/meta`), loadSettings(!!user), localProgressAll()]);
        let start = pageParam ? Number(pageParam) : local[bookId]?.page ?? 0;
        if (user && !pageParam) {
          const remote = await api<{ book_id: string; page: number }[]>("/me/progress").catch(() => []);
          const r = remote.find((x) => x.book_id === bookId);
          if (r) start = r.page;
        }
        start = Math.min(Math.max(0, start), m.total - 1);
        setS(st); setMeta(m); setPage(start); fetchChunk(start);
      } catch (e: any) { setError(e.message); }
    })();
    loadMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Save progress (debounced), prefetch neighbours
  useEffect(() => {
    if (!meta) return;
    if (pages[page] === undefined) fetchChunk(page);
    if (page + 2 < meta.total && pages[page + 2] === undefined) fetchChunk(page + 2);
    const t = setTimeout(() => saveProgress({ book_id: bookId, title: meta.book.title, author: meta.book.author, cover_url: meta.book.cover_url, page, total: meta.total }, !!user), 700);
    return () => clearTimeout(t);
  }, [page, meta, pages, fetchChunk, bookId, user]);

  const update = (patch: Partial<ReaderSettings>) => { const n = { ...s, ...patch }; setS(n); saveSettings(n, !!user); };
  const go = useCallback((p: number) => {
    if (!meta) return;
    const n = Math.max(0, Math.min(meta.total - 1, p));
    setPage(n);
    if (s.mode === "scroll") listRef.current?.scrollToIndex({ index: n, animated: false });
    else scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [meta, s.mode]);
  const goRef = useRef(go); goRef.current = go;
  const pageRef = useRef(page); pageRef.current = page;

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (g.dx < -50) goRef.current(pageRef.current + 1); else if (g.dx > 50) goRef.current(pageRef.current - 1); },
  }), []);

  const isMarked = marks.some((m) => m.page === page);
  const toggleMark = async () => {
    if (!meta) return;
    const existing = marks.find((m) => m.page === page);
    if (user) {
      if (existing) await api(`/me/bookmarks/item/${existing.id}`, { method: "DELETE" });
      else await api(`/me/bookmarks/${encodeURIComponent(bookId)}`, { method: "POST", body: { page, note: "", title: meta.book.title } });
    } else {
      const all = await localBookmarks();
      await setLocalBookmarks(existing ? all.filter((m) => m.id !== existing.id)
        : [{ id: `${Date.now()}`, book_id: bookId, page, note: "", title: meta.book.title, created_at: new Date().toISOString() }, ...all]);
    }
    toast(existing ? "Bookmark removed" : `Bookmarked page ${page + 1}`, "success");
    loadMarks();
  };

  const fontFamily = s.font === "serif" ? fonts.display : s.font === "sans" ? fonts.body : fonts.dyslexic;
  const textStyle = { fontFamily, fontSize: s.size, lineHeight: Math.round(s.size * LINE_HEIGHT[s.spacing]), color: th.fg };
  const contentWrap = { maxWidth: MAX_WIDTH[s.width], width: "100%" as const, alignSelf: "center" as const, paddingHorizontal: MARGIN[s.margin] };
  const showChrome = chrome && !full;
  const pct = meta ? Math.round(((page + 1) / meta.total) * 100) : 0;
  const currentChapter = meta?.toc.filter((t) => t.page <= page).slice(-1)[0]?.title;

  const renderPage = (i: number) => (
    <Text selectable style={[textStyle, styles.para]} testID={`reader-page-text-${i}`}>
      {pages[i] ?? "…"}
    </Text>
  );

  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: th.bg, paddingTop: insets.top }]} testID="reader-screen">
        <Pressable testID="reader-back-button" style={styles.iconBtn} onPress={() => router.back()}><Feather name="arrow-left" size={22} color={th.fg} /></Pressable>
        <StateView testID="reader-error" kind="error" title="This book can't be opened here" body={error} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: th.bg }]} testID="reader-screen">
      <StatusBar hidden={full} style={["dark", "midnight"].includes(s.theme) ? "light" : "dark"} />
      {!meta ? <View style={{ flex: 1, justifyContent: "center" }}><StateView testID="reader-loading" kind="loading" title="Loading manuscript…" /></View> : (
        <>
          {showChrome && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: th.bg, borderBottomColor: th.sub + "33" }]}>
              <Pressable testID="reader-back-button" style={styles.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}><Feather name="arrow-left" size={22} color={th.fg} /></Pressable>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.hTitle, { color: th.fg }]} testID="reader-title">{meta.book.title}</Text>
                <Text numberOfLines={1} style={[styles.hSub, { color: th.sub }]}>{meta.book.author}</Text>
              </View>
              <Pressable testID="reader-toc-button" style={styles.iconBtn} onPress={() => setPanel("toc")}><Feather name="list" size={20} color={th.fg} /></Pressable>
              <Pressable testID="reader-bookmark-button" style={styles.iconBtn} onPress={toggleMark}><Feather name="bookmark" size={20} color={isMarked ? "#A58A58" : th.fg} /></Pressable>
              <Pressable testID="reader-settings-button" style={styles.iconBtn} onPress={() => setPanel("settings")}><Feather name="type" size={20} color={th.fg} /></Pressable>
            </Animated.View>
          )}

          <View style={{ flex: 1 }} {...(s.mode === "paginated" ? pan.panHandlers : {})}>
            {s.mode === "paginated" ? (
              <ScrollView ref={scrollRef} contentContainerStyle={[contentWrap, { paddingTop: showChrome ? space.xl : insets.top + space.xl, paddingBottom: 140 }]}>
                <Pressable onPress={() => setChrome((c) => !c)} testID="reader-content">
                  {currentChapter && !focus && <Text style={[styles.chapter, { color: th.sub }]}>{currentChapter}</Text>}
                  {pages[page] === undefined ? <StateView kind="loading" /> : renderPage(page)}
                </Pressable>
              </ScrollView>
            ) : (
              <FlatList
                ref={listRef}
                data={Array.from({ length: meta.total }, (_, i) => i)}
                keyExtractor={(i) => String(i)}
                initialScrollIndex={page}
                onScrollToIndexFailed={({ index }) => setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 200)}
                windowSize={5}
                contentContainerStyle={{ paddingTop: showChrome ? space.xl : insets.top + space.xl, paddingBottom: 140 }}
                onViewableItemsChanged={onViewable.current}
                viewabilityConfig={{ itemVisiblePercentThreshold: 30 }}
                renderItem={({ item }) => {
                  if (pages[item] === undefined) fetchChunk(item);
                  return <Pressable onPress={() => setChrome((c) => !c)} style={[contentWrap, { minHeight: 300 }]}>{renderPage(item)}<Text style={[styles.pageNo, { color: th.sub }]}>— {item + 1} —</Text></Pressable>;
                }}
              />
            )}
          </View>

          {(showChrome || !focus) && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + 8, backgroundColor: th.bg }]}>
              <View style={[styles.track, { backgroundColor: th.sub + "33" }]}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
              <View style={styles.footRow}>
                <Pressable testID="reader-prev-button" style={styles.navBtn} onPress={() => go(page - 1)} disabled={page === 0}>
                  <Feather name="chevron-left" size={22} color={page === 0 ? th.sub + "66" : th.fg} />
                </Pressable>
                <Text testID="reader-progress" style={[styles.progress, { color: th.sub }]}>Page {page + 1} of {meta.total} · {pct}%</Text>
                <Pressable testID="reader-next-button" style={styles.navBtn} onPress={() => go(page + 1)} disabled={page >= meta.total - 1}>
                  <Feather name="chevron-right" size={22} color={page >= meta.total - 1 ? th.sub + "66" : th.fg} />
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}

      <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPanel(null)} testID="reader-panel-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg, backgroundColor: th.bg }]} testID={`reader-${panel}-panel`}>
          <View style={styles.grab} />
          {panel === "toc" && meta && (
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={[styles.sheetTitle, { color: th.fg }]}>Contents</Text>
              {meta.toc.length === 0 && <Text style={[styles.optLabel, { color: th.sub }]}>No chapters detected — use page navigation.</Text>}
              {meta.toc.map((t, i) => (
                <Pressable key={i} testID={`toc-item-${i}`} style={styles.tocRow} onPress={() => { go(t.page); setPanel(null); }}>
                  <Text style={[styles.tocText, { color: th.fg }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={[styles.tocPage, { color: th.sub }]}>{t.page + 1}</Text>
                </Pressable>
              ))}
              <Text style={[styles.sheetTitle, { color: th.fg, marginTop: space.xl }]}>Bookmarks</Text>
              {marks.length === 0 && <Text style={[styles.optLabel, { color: th.sub }]}>No bookmarks in this book yet.</Text>}
              {marks.map((m, i) => (
                <Pressable key={m.id} testID={`reader-bookmark-${i}`} style={styles.tocRow} onPress={() => { go(m.page); setPanel(null); }}>
                  <Text style={[styles.tocText, { color: th.fg }]}>Page {m.page + 1}</Text>
                  <Feather name="bookmark" size={14} color="#A58A58" />
                </Pressable>
              ))}
            </ScrollView>
          )}
          {panel === "settings" && (
            <ScrollView style={{ maxHeight: 520 }}>
              <Text style={[styles.sheetTitle, { color: th.fg }]}>Reading settings</Text>
              <Opt label="Theme" color={th.sub}>
                {(Object.keys(READER_THEMES) as ReaderSettings["theme"][]).map((k) => (
                  <Pressable key={k} testID={`reader-theme-${k}`} onPress={() => update({ theme: k })} style={styles.swatchWrap}>
                    <View style={[styles.swatch, { backgroundColor: READER_THEMES[k].bg, borderColor: s.theme === k ? "#A58A58" : READER_THEMES[k].sub + "55", borderWidth: s.theme === k ? 2 : 1 }]}>
                      <Text style={{ fontFamily: fonts.display, color: READER_THEMES[k].fg, fontSize: 16 }}>Aa</Text>
                    </View>
                    <Text style={[styles.swatchLabel, { color: th.sub }]}>{READER_THEMES[k].label}</Text>
                  </Pressable>
                ))}
              </Opt>
              <Seg label="Font" color={th} value={s.font} options={[["serif", "Serif"], ["sans", "Sans"], ["dyslexic", "Dyslexia-friendly"]]} onChange={(v) => update({ font: v as any })} />
              <Opt label={`Font size · ${s.size}px`} color={th.sub}>
                <Pressable testID="reader-size-down" style={[styles.sizeBtn, { borderColor: th.sub + "55" }]} onPress={() => update({ size: Math.max(14, s.size - 1) })}><Text style={{ color: th.fg, fontFamily: fonts.display, fontSize: 14 }}>A−</Text></Pressable>
                <View style={[styles.sizeTrack, { backgroundColor: th.sub + "33" }]}><View style={[styles.fill, { width: `${((s.size - 14) / 18) * 100}%` }]} /></View>
                <Pressable testID="reader-size-up" style={[styles.sizeBtn, { borderColor: th.sub + "55" }]} onPress={() => update({ size: Math.min(32, s.size + 1) })}><Text style={{ color: th.fg, fontFamily: fonts.display, fontSize: 20 }}>A+</Text></Pressable>
              </Opt>
              <Seg label="Line spacing" color={th} value={s.spacing} options={[["compact", "Compact"], ["normal", "Normal"], ["relaxed", "Relaxed"], ["wide", "Wide"]]} onChange={(v) => update({ spacing: v as any })} />
              <Seg label="Page width" color={th} value={s.width} options={[["narrow", "Narrow"], ["medium", "Medium"], ["wide", "Wide"]]} onChange={(v) => update({ width: v as any })} />
              <Seg label="Margins" color={th} value={s.margin} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]} onChange={(v) => update({ margin: v as any })} />
              <Seg label="Reading mode" color={th} value={s.mode} options={[["paginated", "Paginated"], ["scroll", "Continuous"]]} onChange={(v) => update({ mode: v as any })} />
              <Seg label="Display" color={th} value={full ? "full" : focus ? "focus" : "normal"} options={[["normal", "Standard"], ["focus", "Focus mode"], ["full", "Full screen"]]}
                onChange={(v) => { setFocus(v === "focus"); setFull(v === "full"); setPanel(null); if (v !== "normal") toast("Tap the page to show controls"); }} />
              <Pressable testID="reader-reset-settings" onPress={() => update(DEFAULT_SETTINGS)} style={[styles.reset, { borderColor: th.sub + "55" }]}>
                <Text style={{ color: th.fg, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.4 }}>RESET SETTINGS</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function Opt({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={[styles.optLabel, { color }]}>{label}</Text>
      <View style={styles.optRow}>{children}</View>
    </View>
  );
}

function Seg({ label, value, options, onChange, color }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; color: { fg: string; sub: string; bg: string } }) {
  return (
    <Opt label={label} color={color.sub}>
      {options.map(([k, l]) => (
        <Pressable key={k} testID={`reader-opt-${label.replace(/ /g, "-").toLowerCase()}-${k}`} onPress={() => onChange(k)}
          style={[styles.seg, { borderColor: value === k ? color.fg : color.sub + "55", backgroundColor: value === k ? color.fg : "transparent" }]}>
          <Text style={{ color: value === k ? color.bg : color.fg, fontFamily: fonts.medium, fontSize: 13 }}>{l}</Text>
        </Pressable>
      ))}
    </Opt>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hTitle: { fontFamily: fonts.display, fontSize: 16 },
  hSub: { fontFamily: fonts.body, fontSize: 11 },
  chapter: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: space.lg, textAlign: "center" },
  para: { textAlign: "left" },
  pageNo: { textAlign: "center", fontFamily: fonts.body, fontSize: 12, marginVertical: space.xl },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg, paddingTop: 6 },
  track: { height: 2, borderRadius: 1, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#A58A58" },
  footRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: { width: 52, height: 48, alignItems: "center", justifyContent: "center" },
  progress: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 0.6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.xl, paddingTop: space.sm },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#77736D55", alignSelf: "center", marginBottom: space.md },
  sheetTitle: { fontFamily: fonts.display, fontSize: 24, marginBottom: space.sm },
  optLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: space.sm },
  optRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  swatchWrap: { alignItems: "center", width: 72 },
  swatch: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  swatchLabel: { fontFamily: fonts.body, fontSize: 10, marginTop: 4, textAlign: "center" },
  seg: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center" },
  sizeBtn: { width: 48, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sizeTrack: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  reset: { marginTop: space.xl, minHeight: 48, borderWidth: 1, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tocRow: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: space.md },
  tocText: { flex: 1, fontFamily: fonts.display, fontSize: 16 },
  tocPage: { fontFamily: fonts.body, fontSize: 12 },
});
