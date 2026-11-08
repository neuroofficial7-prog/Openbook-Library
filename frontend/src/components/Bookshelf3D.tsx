import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useRouter } from "expo-router";

import type { Book } from "@/src/api";
import { AvailabilityBadge, Button, IconButton } from "@/src/components/ui";
import { BookCover, bindingFor, hashOf } from "@/src/components/BookCover";
import { fonts, space, ThemeColors, useTheme } from "@/src/theme";

const SPINE_W = 44;
const GAP = 5;
const COVER_W = 148;
const COVER_H = 222;

type Props = { books: Book[]; testID: string; colorsOverride?: ThemeColors; showDetails?: boolean };

function ShelfBook({ book, index, sel, onPress, colors, testID }: {
  book: Book; index: number; sel: number; onPress: () => void; colors: ThemeColors; testID: string;
}) {
  const reduce = useReducedMotion();
  const active = index === sel;
  const p = useSharedValue(active ? 1 : 0);
  const tilt = useSharedValue(Math.sign(index - sel));
  const hover = useSharedValue(0);
  const spineH = 186 + (hashOf(book.id) % 34);
  const b = bindingFor(book.id);

  useEffect(() => {
    const d = reduce ? 0 : 460;
    p.value = withTiming(active ? 1 : 0, { duration: d });
    tilt.value = reduce ? Math.sign(index - sel) : withSpring(Math.sign(index - sel), { damping: 18, stiffness: 120 });
  }, [active, index, sel, reduce, p, tilt]);

  const wrap = useAnimatedStyle(() => ({
    width: interpolate(p.value, [0, 1], [SPINE_W, COVER_W]),
    height: interpolate(p.value, [0, 1], [spineH, COVER_H]),
    transform: [
      { perspective: 700 },
      { translateY: interpolate(p.value, [0, 1], [0, -16]) - hover.value * 8 },
      { rotateY: `${tilt.value * -14 * (1 - p.value)}deg` },
      { scale: interpolate(p.value, [0, 1], [1, 1.04]) },
    ],
  }));
  const spine = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.55], [1, 0]) }));
  const cover = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.3, 1], [0, 1]) }));

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onHoverIn={() => (hover.value = withTiming(1, { duration: 160 }))}
      onHoverOut={() => (hover.value = withTiming(0, { duration: 160 }))}
      accessibilityLabel={`${book.title} by ${book.author}`}
      style={{ marginRight: GAP, justifyContent: "flex-end" }}
    >
      <Animated.View style={[styles.book, wrap, active && styles.activeShadow]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.spine, { backgroundColor: b.bg }, spine]}>
          <View style={[styles.band, { backgroundColor: b.band, top: 12 }]} />
          <View style={[styles.band, { backgroundColor: b.band, top: 18, height: 1 }]} />
          <View style={styles.spineTextWrap}>
            <View style={[styles.spineRot, { width: spineH - 64 }]}>
              <Text numberOfLines={1} style={[styles.spineTitle, { color: b.fg }]}>{book.title}</Text>
              <Text numberOfLines={1} style={[styles.spineAuthor, { color: b.fg }]}>{book.author}</Text>
            </View>
          </View>
          <View style={[styles.band, { backgroundColor: b.band, bottom: 18, height: 1 }]} />
          <View style={[styles.band, { backgroundColor: b.band, bottom: 12 }]} />
          <View style={styles.spineShade} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, cover]} pointerEvents="none">
          <BookCover book={book} width={COVER_W} height={COVER_H} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function Bookshelf3D({ books, testID, colorsOverride, showDetails = true }: Props) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState(0);
  const scroller = useRef<any>(null);
  const selRef = useRef(0);
  selRef.current = sel;
  const count = books.length;

  const go = (i: number) => setSel(Math.max(0, Math.min(count - 1, i)));

  useEffect(() => {
    if (sel >= count) setSel(0);
  }, [count, sel]);

  useEffect(() => {
    const x = sel * (SPINE_W + GAP) - (width - COVER_W) / 2 + space.xl;
    scroller.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [sel, width]);

  // Keyboard navigation on web (← →, Enter to open)
  useEffect(() => {
    if (Platform.OS !== "web" || !showDetails) return;
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "ArrowRight") setSel((s) => Math.min(count - 1, s + 1));
      if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [count, showDetails]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          const steps = Math.max(1, Math.min(4, Math.round(Math.abs(g.dx) / 70)));
          if (g.dx < -30) go(selRef.current + steps);
          else if (g.dx > 30) go(selRef.current - steps);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count],
  );

  if (!count) return null;
  const book = books[Math.min(sel, count - 1)];

  const primary = () => {
    if (book.availability === "READ ONLINE") router.push(`/read/${encodeURIComponent(book.id)}`);
    else router.push(`/book/${encodeURIComponent(book.id)}`);
  };

  return (
    <View testID={testID}>
      <View {...pan.panHandlers} style={[styles.stage, { backgroundColor: colors.shelf }]}>
        <ScrollView ref={scroller} horizontal scrollEnabled={Platform.OS === "web"} showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: width / 2 - COVER_W / 2, alignItems: "flex-end", paddingTop: 36 }}>
          {books.map((bk, i) => (
            <ShelfBook key={bk.id} book={bk} index={i} sel={sel} colors={colors} testID={`${testID}-book-${i}`}
              onPress={() => (i === sel ? router.push(`/book/${encodeURIComponent(bk.id)}`) : go(i))} />
          ))}
        </ScrollView>
        <View style={[styles.plank, { backgroundColor: colors.plank }]} />
        <View style={[styles.plankEdge, { backgroundColor: colors.plankEdge }]} />
      </View>

      <View style={styles.controls}>
        <IconButton testID={`${testID}-prev`} name="chevron-left" color={colors.onSurface} onPress={() => go(sel - 1)} />
        <Text style={[styles.counter, { color: colors.muted }]}>{String(sel + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</Text>
        <IconButton testID={`${testID}-next`} name="chevron-right" color={colors.onSurface} onPress={() => go(sel + 1)} />
      </View>

      {showDetails && (
        <Animated.View key={book.id} entering={FadeIn.duration(380)} style={styles.details} testID={`${testID}-details`}>
          <Text testID={`${testID}-selected-title`} style={[styles.dTitle, { color: colors.onSurface }]} numberOfLines={2}>{book.title}</Text>
          <Text style={[styles.dAuthor, { color: colors.onSurface }]}>{book.author}</Text>
          <Text style={[styles.dMeta, { color: colors.muted }]}>
            {[book.publication_year ?? book.author_years, book.language, book.genre].filter(Boolean).join("  ·  ")}
          </Text>
          {!!book.description && <Text numberOfLines={3} style={[styles.dDesc, { color: colors.onSurface }]}>{book.description}</Text>}
          <View style={styles.dRow}>
            <AvailabilityBadge value={book.availability} colorsOverride={colors} testID={`${testID}-availability`} />
            <Text style={[styles.dSource, { color: colors.muted }]}>via {book.source_name}</Text>
          </View>
          <View style={styles.dActions}>
            <Button testID={`${testID}-read-button`} colorsOverride={colors} label={book.availability === "READ ONLINE" ? "Read online" : "View book"}
              icon={book.availability === "READ ONLINE" ? "book-open" : "arrow-up-right"} onPress={primary} style={{ flex: 1 }} />
            <Button testID={`${testID}-details-button`} colorsOverride={colors} variant="secondary" label="Details" onPress={() => router.push(`/book/${encodeURIComponent(book.id)}`)} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: 300, justifyContent: "flex-end", overflow: "hidden" },
  book: { borderRadius: 3, overflow: "hidden" },
  activeShadow: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 14 }, elevation: 12 },
  spine: { borderRadius: 3, alignItems: "center", justifyContent: "center" },
  band: { position: "absolute", left: 0, right: 0, height: 2 },
  spineTextWrap: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%" },
  spineRot: { transform: [{ rotate: "90deg" }], alignItems: "center", position: "absolute" },
  spineTitle: { fontFamily: fonts.displayBold, fontSize: 13, letterSpacing: 0.4 },
  spineAuthor: { fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase", opacity: 0.8, marginTop: 2 },
  spineShade: { position: "absolute", top: 0, bottom: 0, right: 0, width: 8, backgroundColor: "rgba(0,0,0,0.22)" },
  plank: { height: 12 },
  plankEdge: { height: 10, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.lg, marginTop: space.sm },
  counter: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 2, minWidth: 64, textAlign: "center" },
  details: { paddingHorizontal: space.xl, paddingTop: space.sm },
  dTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  dAuthor: { fontFamily: fonts.displayItalic, fontSize: 17, marginTop: 4 },
  dMeta: { fontFamily: fonts.medium, fontSize: 12, letterSpacing: 0.6, marginTop: space.sm },
  dDesc: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, marginTop: space.md, opacity: 0.85 },
  dRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg },
  dSource: { fontFamily: fonts.body, fontSize: 12 },
  dActions: { flexDirection: "row", gap: space.md, marginTop: space.lg },
});
