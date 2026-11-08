import React from "react";
import { FlatList, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api, Book } from "@/src/api";
import { Bookshelf3D } from "@/src/components/Bookshelf3D";
import { BookRow } from "@/src/components/ShelfRow";
import { Eyebrow, IconButton, StateView } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";

export default function CategoryScreen() {
  const styles = useStyles();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["category", slug], queryFn: () => api<{ name: string; books: Book[] }>(`/categories/${slug}`) });
  return (
    <View style={styles.root} testID="category-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="category-back-button" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <View style={{ flex: 1 }}>
          <Eyebrow>Reading room</Eyebrow>
          <Text style={styles.title} testID="category-title">{q.data?.name ?? "…"}</Text>
        </View>
      </View>
      {q.isLoading && <StateView testID="category-loading" kind="loading" title="Gathering volumes…" />}
      {q.isError && <StateView testID="category-error" kind="error" title="Could not load this collection" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data && (
        <FlatList
          data={q.data.books}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          ListHeaderComponent={q.data.books.length ? <View style={{ marginBottom: space.lg }}><Bookshelf3D testID="category-shelf" books={q.data.books.slice(0, 16)} /></View> : undefined}
          ListEmptyComponent={<StateView testID="category-empty" kind="empty" title="No volumes yet" body="No source currently lists books for this room." />}
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: space.xl }}>
              <BookRow book={item} testID={`category-result-${index}`} onPress={() => router.push(`/book/${encodeURIComponent(item.id)}`)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.md, borderBottomWidth: 0.5, borderBottomColor: c.border },
  title: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
}));
