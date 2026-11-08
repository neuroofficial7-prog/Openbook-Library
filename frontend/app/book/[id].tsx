import React, { useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInUp } from "react-native-reanimated";

import { api, Book } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BookCover } from "@/src/components/BookCover";
import { AvailabilityBadge, Button, Eyebrow, IconButton, StateView } from "@/src/components/ui";
import { fonts, makeStyles, space, useTheme } from "@/src/theme";
import { useToast } from "@/src/toast";

export default function BookDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const bookId = decodeURIComponent(String(id));
  const q = useQuery({ queryKey: ["book", bookId], queryFn: () => api<Book>(`/books/${encodeURIComponent(bookId)}`) });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) api<{ book_id: string }[]>("/me/saved").then((l) => setSaved(l.some((x) => x.book_id === bookId))).catch(() => {});
  }, [user, bookId]);

  const b = q.data;
  const toggleSave = async () => {
    if (!user) { toast("Sign in to save books to your shelf"); return router.push("/auth"); }
    if (!b) return;
    try {
      if (saved) await api(`/me/saved/${encodeURIComponent(b.id)}`, { method: "DELETE" });
      else await api(`/me/saved/${encodeURIComponent(b.id)}`, { method: "PUT", body: { title: b.title, author: b.author, cover_url: b.cover_url ?? null, availability: b.availability } });
      setSaved(!saved);
      toast(saved ? "Removed from your shelf" : "Saved to your shelf", "success");
    } catch (e: any) { toast(e.message, "error"); }
  };

  const openSource = (url?: string | null) => url && WebBrowser.openBrowserAsync(url);

  const cta = () => {
    if (!b) return null;
    switch (b.availability) {
      case "READ ONLINE": return <Button testID="book-read-button" label="Read online" icon="book-open" onPress={() => router.push(`/read/${encodeURIComponent(b.id)}`)} />;
      case "READ AT SOURCE": return <Button testID="book-read-source-button" label={`Read at ${b.source_name}`} icon="external-link" onPress={() => openSource(b.reader_url || b.source_url)} />;
      case "BORROW TO READ": return <Button testID="book-borrow-button" label="Borrow at source" icon="clock" onPress={() => openSource(b.reader_url || b.source_url)} />;
      case "METADATA ONLY": return <Button testID="book-record-button" variant="secondary" label="View catalogue record" icon="file-text" onPress={() => openSource(b.source_url)} />;
      default: return <Button testID="book-unavailable-button" label="Not currently available" disabled />;
    }
  };

  return (
    <View style={styles.root} testID="book-detail-screen">
      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="book-back-button" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <View style={{ flex: 1 }} />
        {b && <IconButton testID="book-share-button" name="share" onPress={() => Share.share({ message: `${b.title} by ${b.author} — on OpenBook Library. ${b.source_url ?? ""}` })} />}
        {b && <IconButton testID="book-save-button" name="bookmark" color={saved ? colors.brandPrimary : colors.onSurface} onPress={toggleSave} />}
      </View>
      {q.isLoading && <StateView testID="book-loading" kind="loading" />}
      {q.isError && <StateView testID="book-error" kind="error" title="Could not retrieve this book" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {b && (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
            <View style={styles.stage}>
              <Animated.View entering={FadeInUp.duration(500)} style={styles.coverShadow}>
                <BookCover testID="book-cover" book={b} width={170} height={255} />
              </Animated.View>
              <View style={[styles.plank, { backgroundColor: colors.plank }]} />
            </View>
            <View style={styles.body}>
              <Eyebrow>{b.source_name}{b.also_at?.length ? ` · also at ${b.also_at.join(", ")}` : ""}</Eyebrow>
              <Text testID="book-title" style={styles.title}>{b.title}</Text>
              <Text testID="book-author" style={styles.author}>{b.author}{b.author_years ? `  (${b.author_years})` : ""}</Text>
              <View style={{ marginTop: space.lg }}><AvailabilityBadge testID="book-availability" value={b.availability} /></View>
              <View style={styles.meta}>
                <Meta label="Published" value={b.publication_year ? String(b.publication_year) : "Not stated by source"} />
                <Meta label="Language" value={b.language} />
                <Meta label="Genre" value={b.genre || b.category || "—"} />
                <Meta label="Publisher" value={b.publisher || "—"} />
                {b.isbn?.length > 0 && <Meta label="ISBN" value={b.isbn[0]} />}
                {!!b.country && <Meta label="Country" value={b.country} />}
              </View>
              {!!b.description && <Text testID="book-description" style={styles.desc}>{b.description}</Text>}
              {!b.description && <Text style={styles.descMuted}>The source has not provided a description for this book.</Text>}
              {b.subjects?.length > 0 && <Text style={styles.subjects}>{b.subjects.join("  ·  ")}</Text>}
              <View style={styles.rights} testID="book-rights">
                <Text style={styles.rightsLabel}>Rights & licence</Text>
                <Text style={styles.rightsText}>{b.licence || "Not stated by source"}</Text>
                <Text style={styles.rightsLabel}>Source attribution</Text>
                <Text style={styles.rightsText} onPress={() => openSource(b.source_url)}>{b.source_name}{b.source_url ? " — open record ↗" : ""}</Text>
              </View>
            </View>
          </ScrollView>
          <View style={[styles.bar, { paddingBottom: insets.bottom + space.md }]}>{cta()}</View>
        </>
      )}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, backgroundColor: c.shelf },
  stage: { backgroundColor: c.shelf, alignItems: "center", paddingTop: space.lg },
  coverShadow: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 12 }, elevation: 10, borderRadius: 3 },
  plank: { height: 14, width: "100%", marginTop: -2 },
  body: { paddingHorizontal: space.xl, paddingTop: space.xl },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: c.onSurface, marginTop: space.sm },
  author: { fontFamily: fonts.displayItalic, fontSize: 18, color: c.onSurface, marginTop: space.xs },
  meta: { flexDirection: "row", flexWrap: "wrap", marginTop: space.xl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  metaItem: { width: "50%", paddingVertical: space.md, paddingRight: space.md },
  metaLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: c.muted },
  metaValue: { fontFamily: fonts.medium, fontSize: 14, color: c.onSurface, marginTop: 3 },
  desc: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26, color: c.onSurface, marginTop: space.lg },
  descMuted: { fontFamily: fonts.displayItalic, fontSize: 14, color: c.muted, marginTop: space.lg },
  subjects: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: space.lg, lineHeight: 18 },
  rights: { marginTop: space.xl, padding: space.lg, backgroundColor: c.surfaceSecondary, borderRadius: 8, gap: 4 },
  rightsLabel: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: c.muted, marginTop: space.sm },
  rightsText: { fontFamily: fonts.body, fontSize: 13, color: c.onSurface, lineHeight: 19 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
}));
