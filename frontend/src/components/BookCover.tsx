import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import type { Book } from "@/src/api";
import { fonts } from "@/src/theme";

// Decorative cloth-binding tones for generated covers and spines. These are book
// materials, so they stay identical in light and dark themes.
export const BINDINGS = [
  { bg: "#5B2A2A", fg: "#EADFCD", band: "#C2A878" }, // oxblood
  { bg: "#1F2E3D", fg: "#E8E4DC", band: "#A58A58" }, // navy
  { bg: "#2F4135", fg: "#EADFCD", band: "#C2A878" }, // forest
  { bg: "#8A6A3B", fg: "#F3F0E9", band: "#3A2E1E" }, // ochre
  { bg: "#2B2A28", fg: "#E8E4DC", band: "#A58A58" }, // charcoal
  { bg: "#4A3348", fg: "#EADFCD", band: "#C2A878" }, // plum
  { bg: "#D9CFBE", fg: "#2B2A28", band: "#7A2E2A" }, // parchment
  { bg: "#6E4E37", fg: "#F3F0E9", band: "#E2C48E" }, // tan leather
];

export function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const bindingFor = (id: string) => BINDINGS[hashOf(id) % BINDINGS.length];

export function BookCover({ book, width, height, testID, radius = 3 }: { book: Pick<Book, "id" | "title" | "author" | "cover_url">; width: number; height: number; testID?: string; radius?: number }) {
  const b = bindingFor(book.id);
  return (
    <View testID={testID} style={[styles.wrap, { width, height, borderRadius: radius, backgroundColor: b.bg }]}>
      {/* Generated placeholder always renders underneath; a real cover covers it when it loads. */}
      <View style={[styles.ph, { borderColor: b.band }]}>
        <View style={[styles.rule, { backgroundColor: b.band }]} />
        <Text numberOfLines={4} style={[styles.phTitle, { color: b.fg, fontSize: Math.max(11, width / 9) }]}>{book.title}</Text>
        <Text numberOfLines={2} style={[styles.phAuthor, { color: b.fg, fontSize: Math.max(8, width / 16) }]}>{book.author}</Text>
        <View style={[styles.rule, { backgroundColor: b.band }]} />
      </View>
      {!!book.cover_url && (
        <Image source={{ uri: book.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" recyclingKey={book.id} />
      )}
      <View style={styles.hinge} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  ph: { flex: 1, margin: 6, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 8 },
  rule: { width: 22, height: 1 },
  phTitle: { fontFamily: fonts.displayBold, textAlign: "center", lineHeight: undefined },
  phAuthor: { fontFamily: fonts.medium, textAlign: "center", letterSpacing: 0.6, textTransform: "uppercase" },
  hinge: { position: "absolute", left: 3, top: 0, bottom: 0, width: 2, backgroundColor: "rgba(0,0,0,0.18)" },
});
