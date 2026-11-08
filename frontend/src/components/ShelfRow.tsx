import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { Book } from "@/src/api";
import { BookCover } from "@/src/components/BookCover";
import { AvailabilityBadge } from "@/src/components/ui";
import { fonts, space, ThemeColors, useTheme } from "@/src/theme";

/** Covers standing on a shelf plank — the cinematic secondary row. */
export function ShelfRow({ books, testID, colorsOverride, size = 104 }: { books: Book[]; testID: string; colorsOverride?: ThemeColors; size?: number }) {
  const { colors: themed } = useTheme();
  const colors = colorsOverride ?? themed;
  const router = useRouter();
  if (!books.length) return null;
  return (
    <View testID={testID}>
      <FlatList
        horizontal
        data={books}
        keyExtractor={(b) => b.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.lg }}
        renderItem={({ item, index }) => (
          <Pressable testID={`${testID}-item-${index}`} onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)} style={{ width: size }}>
            <View style={styles.coverShadow}>
              <BookCover book={item} width={size} height={size * 1.5} />
            </View>
            <View style={[styles.plank, { backgroundColor: colors.plank, width: size + space.lg }]} />
            <Text numberOfLines={2} style={[styles.title, { color: colors.onSurface }]}>{item.title}</Text>
            <Text numberOfLines={1} style={[styles.author, { color: colors.muted }]}>{item.author}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

export function BookRow({ book, testID, onPress }: { book: Book; testID: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.row, { borderBottomColor: colors.divider }]}>
      <BookCover book={book} width={62} height={92} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.onSurface }]}>{book.title}</Text>
        <Text numberOfLines={1} style={[styles.rowAuthor, { color: colors.onSurface }]}>{book.author}</Text>
        <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.muted }]}>
          {[book.publication_year, book.language, book.source_name].filter(Boolean).join("  ·  ")}
        </Text>
        {!!book.licence && <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.muted }]}>{book.licence}</Text>}
        <View style={{ marginTop: 4 }}><AvailabilityBadge value={book.availability} /></View>
      </View>
    </Pressable>
  );
}

export function CoverGridItem({ book, testID, onPress, width }: { book: Book; testID: string; onPress: () => void; width: number }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={{ width, marginBottom: space.xl }}>
      <View style={styles.coverShadow}><BookCover book={book} width={width} height={width * 1.5} /></View>
      <Text numberOfLines={2} style={[styles.title, { color: colors.onSurface }]}>{book.title}</Text>
      <Text numberOfLines={1} style={[styles.author, { color: colors.muted }]}>{book.author}</Text>
      <View style={{ marginTop: 6 }}><AvailabilityBadge value={book.availability} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  coverShadow: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 2, height: 6 }, elevation: 5, borderRadius: 3 },
  plank: { height: 6, marginLeft: -space.sm, marginTop: 0, borderRadius: 1 },
  title: { fontFamily: fonts.display, fontSize: 14, lineHeight: 18, marginTop: space.md },
  author: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  row: { flexDirection: "row", gap: space.lg, paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23 },
  rowAuthor: { fontFamily: fonts.displayItalic, fontSize: 14 },
  rowMeta: { fontFamily: fonts.body, fontSize: 12 },
});
