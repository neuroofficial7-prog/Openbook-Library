import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api, Book } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { BookCover, BINDINGS } from "@/src/components/BookCover";
import { Bookshelf3D } from "@/src/components/Bookshelf3D";
import { PuanBand } from "@/src/components/PuanBand";
import { ShelfRow } from "@/src/components/ShelfRow";
import { Button, Chip, Eyebrow, Icon, IconButton, SectionHeader, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { continueReading, LocalProgress } from "@/src/reader-store";
import { fonts, makeStyles, radius, space, useTheme } from "@/src/theme";

type Home = {
  hero: Book[]; featured: Book[]; recent: Book[]; mizo: Book[];
  international: { code: string; region: string; language: string; books: Book[] }[];
  categories: { slug: string; name: string }[];
  mizo_collections: { slug: string; name: string }[];
};

const FOOTER = [
  ["about", "About OpenBook"], ["contact", "Contact"], ["privacy", "Privacy Policy"], ["terms", "Terms of Service"],
  ["copyright", "Copyright Information"], ["help", "Help Centre"],
] as const;

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const q = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("/home"), staleTime: 1000 * 60 * 10 });
  const [cont, setCont] = useState<LocalProgress[]>([]);
  const [intl, setIntl] = useState(0);

  useFocusEffect(useCallback(() => { continueReading(!!user).then(setCont); }, [user]));
  useEffect(() => { if (q.data && intl >= q.data.international.length) setIntl(0); }, [q.data, intl]);

  const d = q.data;
  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordmark} testID="home-wordmark">OPENBOOK LIBRARY</Text>
        </View>
        <IconButton testID="home-search-button" name="search" onPress={() => router.push("/search")} />
        <IconButton testID="home-account-button" name="user" onPress={() => router.push(user ? "/shelf" : "/auth")} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomChrome + space.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.hero}>
          <Eyebrow>A global digital library</Eyebrow>
          <Text style={styles.tagline}>Discover stories.{"\n"}Explore knowledge.</Text>
        </View>

        {q.isLoading && <ShelfSkeleton />}
        {q.isError && <StateView testID="home-error" kind="error" title="The archive is temporarily closed" body={(q.error as Error).message} onRetry={() => q.refetch()} />}

        {d && (
          <>
            <Bookshelf3D testID="hero-shelf" books={d.hero} />

            {cont.length > 0 && (
              <Section>
                <SectionHeader eyebrow="Pick up where you left off" title="Continue Reading" />
                <FlatList horizontal data={cont} keyExtractor={(p) => p.book_id} showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.lg }}
                  renderItem={({ item, index }) => (
                    <Pressable testID={`continue-item-${index}`} style={styles.contCard} onPress={() => router.push(`/read/${encodeURIComponent(item.book_id)}`)}>
                      <BookCover book={{ id: item.book_id, title: item.title, author: item.author, cover_url: item.cover_url }} width={56} height={84} />
                      <View style={{ flex: 1, justifyContent: "center" }}>
                        <Text numberOfLines={2} style={styles.contTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={styles.contAuthor}>{item.author}</Text>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${Math.round(((item.page + 1) / item.total) * 100)}%` }]} />
                        </View>
                        <Text style={styles.contPct}>{Math.round(((item.page + 1) / item.total) * 100)}% · page {item.page + 1} of {item.total}</Text>
                      </View>
                    </Pressable>
                  )} />
              </Section>
            )}

            {d.featured.length > 0 && (
              <Section>
                <SectionHeader eyebrow="Featured collection" title="Tales of Adventure" action="All" testID="featured-see-all" onAction={() => router.push("/category/fiction")} />
                <ShelfRow testID="featured-shelf" books={d.featured} />
              </Section>
            )}

            <Section>
              <SectionHeader eyebrow="Explore by category" title="The Reading Rooms" />
              <FlatList horizontal data={d.categories} keyExtractor={(c) => c.slug} showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.md }}
                renderItem={({ item, index }) => {
                  const b = BINDINGS[index % BINDINGS.length];
                  return (
                    <Pressable testID={`category-${item.slug}`} onPress={() => router.push(`/category/${item.slug}`)}
                      style={[styles.catVolume, { backgroundColor: b.bg }]}>
                      <View style={[styles.catBand, { backgroundColor: b.band }]} />
                      <Text style={[styles.catNum, { color: b.band }]}>{String(index + 1).padStart(2, "0")}</Text>
                      <Text style={[styles.catName, { color: b.fg }]}>{item.name}</Text>
                      <View style={[styles.catBand, { backgroundColor: b.band, marginTop: "auto" }]} />
                    </Pressable>
                  );
                }} />
            </Section>

            {/* MIZO HERITAGE LIBRARY */}
            <Animated.View entering={FadeInDown.duration(500)} style={styles.mizo} testID="home-mizo-section">
              <PuanBand />
              <View style={styles.mizoInner}>
                <Eyebrow color={colors.mizo}>Ziak leh chhiar · Words of the hills</Eyebrow>
                <Text style={styles.mizoTitle}>Mizo Heritage{"\n"}Library</Text>
                <Text style={styles.mizoBody}>
                  Preserving Mizo literature, history, folklore and poetry, and making it discoverable to readers everywhere.
                </Text>
              </View>
              <ShelfRow testID="mizo-shelf" books={d.mizo} />
              <View style={{ paddingHorizontal: space.xl, marginTop: space.xl }}>
                <Button testID="enter-mizo-button" label="Enter the Heritage Library" icon="arrow-right" onPress={() => router.push("/mizo")} />
              </View>
              <PuanBand height={6} />
            </Animated.View>

            {d.international.length > 0 && (
              <Section>
                <SectionHeader eyebrow="International collections" title="Literature of the World" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}
                  contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm, alignItems: "center" }}>
                  {d.international.map((r, i) => (
                    <Chip key={r.code} testID={`intl-chip-${r.code}`} label={r.language} active={i === intl} onPress={() => setIntl(i)} />
                  ))}
                </ScrollView>
                <Text style={styles.region}>{d.international[intl]?.region}</Text>
                <ShelfRow testID="intl-shelf" books={d.international[intl]?.books ?? []} />
              </Section>
            )}

            {d.recent.length > 0 && (
              <Section>
                <SectionHeader eyebrow="Newly indexed" title="Recently Added" />
                <ShelfRow testID="recent-shelf" books={d.recent} />
              </Section>
            )}

            <Pressable testID="after-dark-entry" onPress={() => router.push("/after-dark")} style={styles.afterDark}>
              <Text style={styles.adEyebrow}>Separate · Age-gated</Text>
              <Text style={styles.adTitle}>OpenBook After Dark — 18+</Text>
              <Text style={styles.adBody}>Literature for adult readers, kept apart from the general library.</Text>
              <Icon name="arrow-right" color={colors.brandPrimary} />
            </Pressable>
          </>
        )}

        <View style={styles.footer} testID="home-footer">
          <Text style={styles.footerMark}>OpenBook Library</Text>
          <Text style={styles.footerTag}>Discover Stories. Explore Knowledge. Read Without Boundaries.</Text>
          <View style={styles.footerLinks}>
            {FOOTER.map(([slug, label]) => (
              <Pressable key={slug} testID={`footer-${slug}`} onPress={() => router.push(`/info/${slug}`)} style={styles.footerLink}>
                <Text style={styles.footerLinkText}>{label}</Text>
              </Pressable>
            ))}
            <Pressable testID="footer-submit" onPress={() => router.push("/submit")} style={styles.footerLink}>
              <Text style={styles.footerLinkText}>Submit a Book</Text>
            </Pressable>
            <Pressable testID="footer-admin" onPress={() => router.push("/admin")} style={styles.footerLink}>
              <Text style={styles.footerLinkText}>Staff sign in</Text>
            </Pressable>
          </View>
          <Text style={styles.footerFine}>Books are shown with their source and rights information. OpenBook never offers unauthorised downloads.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: space.xxxl }}>{children}</Animated.View>;
}

function ShelfSkeleton() {
  const { colors } = useTheme();
  return (
    <View testID="home-loading" style={{ height: 300, backgroundColor: colors.shelf, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.xl, gap: 5 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={{ width: 44, height: 180 + ((i * 17) % 40), backgroundColor: colors.surfaceTertiary, borderRadius: 3, opacity: 0.5 + (i % 3) * 0.15 }} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  wordmark: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 4, color: c.onSurface, paddingLeft: space.sm },
  hero: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.lg },
  tagline: { fontFamily: fonts.display, fontSize: 36, lineHeight: 42, color: c.onSurface, marginTop: space.sm },
  contCard: { width: 280, flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceSecondary },
  contTitle: { fontFamily: fonts.display, fontSize: 16, color: c.onSurface },
  contAuthor: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  progressTrack: { height: 3, backgroundColor: c.border, borderRadius: 2, marginTop: space.sm, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: c.brandPrimary },
  contPct: { fontFamily: fonts.medium, fontSize: 11, color: c.muted, marginTop: 4 },
  catVolume: { width: 104, height: 168, borderRadius: 4, padding: space.md, overflow: "hidden" },
  catBand: { height: 2, width: "100%" },
  catNum: { fontFamily: fonts.displayItalic, fontSize: 22, marginTop: space.md },
  catName: { fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 20, marginTop: space.sm },
  mizo: { marginTop: space.xxxl, backgroundColor: c.mizoTint, paddingBottom: 0 },
  mizoInner: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl },
  mizoTitle: { fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 44, color: c.onSurface, marginTop: space.sm },
  mizoBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: c.onSurface, opacity: 0.8, marginTop: space.md },
  chipRow: { height: 56, flexGrow: 0 },
  region: { fontFamily: fonts.displayItalic, fontSize: 15, color: c.muted, paddingHorizontal: space.xl, marginBottom: space.lg },
  afterDark: { marginHorizontal: space.xl, marginTop: space.xxxl, padding: space.xl, borderRadius: radius.md, backgroundColor: "#171717", gap: space.sm },
  adEyebrow: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2, color: c.brandPrimary, textTransform: "uppercase" },
  adTitle: { fontFamily: fonts.display, fontSize: 22, color: "#F3F0E9" },
  adBody: { fontFamily: fonts.body, fontSize: 13, color: "#A39E96", lineHeight: 20 },
  footer: { marginTop: space.xxxl, paddingHorizontal: space.xl, paddingTop: space.xxl, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  footerMark: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  footerTag: { fontFamily: fonts.body, fontSize: 13, color: c.muted, marginTop: 4 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", marginTop: space.lg, marginHorizontal: -space.sm },
  footerLink: { paddingVertical: space.sm, paddingHorizontal: space.sm, minHeight: 44, justifyContent: "center" },
  footerLinkText: { fontFamily: fonts.medium, fontSize: 13, color: c.onSurface },
  footerFine: { fontFamily: fonts.body, fontSize: 11, color: c.muted, marginTop: space.lg, lineHeight: 17 },
}));
