import React, { useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BASE, Book } from "@/src/api";
import { BookCover } from "@/src/components/BookCover";
import { AvailabilityBadge, Icon, IconName } from "@/src/components/ui";
import { fonts, radius, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

// The card itself is a printed keepsake: fixed paper colours so the shared image
// looks identical whatever theme the sender uses.
const PAPER = { bg: "#F3F0E9", shelf: "#E8E4DC", plank: "#CFC6B6", ink: "#202020", sub: "#77736D", gold: "#A58A58" };

export const shareLinkFor = (b: Book) => `${BASE}/share/${encodeURIComponent(b.id)}`;

export function ShareSheet({ book, visible, onClose }: { book: Book; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const card = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const link = shareLinkFor(book);
  const message = `📖 ${book.title} — ${book.author}\nDiscover it on OpenBook Library:\n${link}`;

  const shareImage = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: "png", quality: 1, result: "tmpfile" });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: `Share “${book.title}”`, UTI: "public.png" });
      await Clipboard.setStringAsync(link);
      toast("Link copied too — paste it under your image", "success");
    } catch (e: any) {
      toast(e?.message || "Could not create the card image", "error");
    } finally {
      setBusy(false);
    }
  };

  const whatsapp = async () => {
    const text = encodeURIComponent(message);
    const app = `whatsapp://send?text=${text}`;
    try {
      if (Platform.OS !== "web" && (await Linking.canOpenURL(app))) await Linking.openURL(app);
      else await Linking.openURL(`https://wa.me/?text=${text}`);
    } catch {
      await Linking.openURL(`https://wa.me/?text=${text}`);
    }
  };

  const more = async () => {
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).share) await (navigator as any).share({ title: book.title, text: message, url: link });
      else await Share.share({ message, url: link, title: book.title });
    } catch {}
  };

  const copy = async () => {
    await Clipboard.setStringAsync(link);
    toast("Link copied", "success");
  };

  const actions: { key: string; icon: IconName; label: string; onPress: () => void; hide?: boolean }[] = [
    { key: "image", icon: "image", label: busy ? "Preparing…" : "Share card", onPress: shareImage, hide: Platform.OS === "web" },
    { key: "whatsapp", icon: "message-circle", label: "WhatsApp", onPress: whatsapp },
    { key: "more", icon: "share-2", label: "More apps", onPress: more },
    { key: "copy", icon: "link", label: "Copy link", onPress: copy },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable testID="share-backdrop" style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={onClose} />
      <View testID="share-sheet" style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Share this book</Text>

        {/* The captured card */}
        <View ref={card} collapsable={false} style={styles.card} testID="share-card">
          <Text style={styles.brand}>OPENBOOK LIBRARY</Text>
          <View style={styles.shelf}>
            <View style={styles.coverShadow}><BookCover book={book} width={128} height={192} /></View>
            <View style={styles.plank} />
          </View>
          <Text style={styles.bookTitle} numberOfLines={3}>{book.title}</Text>
          <Text style={styles.author} numberOfLines={1}>{book.author}</Text>
          <Text style={styles.meta} numberOfLines={1}>{[book.publication_year ?? book.author_years, book.language, book.source_name].filter(Boolean).join("  ·  ")}</Text>
          <View style={{ alignSelf: "center", marginTop: space.md }}><AvailabilityBadge value={book.availability} /></View>
          <View style={styles.rule} />
          <Text style={styles.tag}>Discover Stories. Explore Knowledge.</Text>
        </View>

        <View style={styles.actions}>
          {actions.filter((a) => !a.hide).map((a) => (
            <Pressable key={a.key} testID={`share-${a.key}-button`} onPress={a.onPress} disabled={busy} style={styles.action}>
              <View style={[styles.actionIcon, { backgroundColor: a.key === "whatsapp" ? "#25D366" : colors.surfaceSecondary }]}>
                <Icon name={a.icon} size={20} color={a.key === "whatsapp" ? "#FFFFFF" : colors.onSurface} />
              </View>
              <Text style={[styles.actionLabel, { color: colors.onSurface }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text testID="share-link-text" numberOfLines={1} style={[styles.link, { color: colors.muted }]}>{link}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.xl, paddingTop: space.sm },
  grab: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: space.md },
  title: { fontFamily: fonts.display, fontSize: 24, marginBottom: space.lg },
  card: { backgroundColor: PAPER.bg, borderRadius: radius.md, overflow: "hidden", paddingBottom: space.xl, alignSelf: "center", width: 300, borderWidth: 1, borderColor: "#D8D2C8" },
  brand: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 3.5, color: PAPER.ink, textAlign: "center", paddingVertical: space.md },
  shelf: { backgroundColor: PAPER.shelf, alignItems: "center", paddingTop: space.xl },
  coverShadow: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 8, borderRadius: 3 },
  plank: { height: 10, alignSelf: "stretch", backgroundColor: PAPER.plank, marginTop: -1 },
  bookTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: PAPER.ink, textAlign: "center", marginTop: space.lg, paddingHorizontal: space.lg },
  author: { fontFamily: fonts.displayItalic, fontSize: 15, color: PAPER.ink, textAlign: "center", marginTop: 4 },
  meta: { fontFamily: fonts.medium, fontSize: 11, color: PAPER.sub, textAlign: "center", marginTop: space.sm, paddingHorizontal: space.lg },
  rule: { width: 28, height: 1, backgroundColor: PAPER.gold, alignSelf: "center", marginTop: space.lg },
  tag: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 2, color: PAPER.gold, textAlign: "center", marginTop: space.md, textTransform: "uppercase" },
  actions: { flexDirection: "row", justifyContent: "space-around", marginTop: space.xl },
  action: { alignItems: "center", gap: 6, minWidth: 64 },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: fonts.medium, fontSize: 12 },
  link: { fontFamily: fonts.body, fontSize: 11, textAlign: "center", marginTop: space.lg },
});
