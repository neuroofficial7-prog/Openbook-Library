import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { api, Book } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { ShelfRow } from "@/src/components/ShelfRow";
import { Button, Checkbox, Eyebrow, IconButton, StateView } from "@/src/components/ui";
import { darkColors as C, fonts, radius, space } from "@/src/theme";

const BG = "https://images.unsplash.com/photo-1653162310127-2aa28f1b7327?crop=entropy&cs=srgb&fm=jpg&q=80&w=1200";

export default function AfterDark() {
  const { ageConfirmed } = useAuth();
  return ageConfirmed ? <Collection /> : <Gate />;
}

function Gate() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { confirmAge } = useAuth();
  const [checked, setChecked] = useState(false);
  return (
    <View style={styles.root} testID="age-gate-screen">
      <StatusBar style="light" />
      <Image source={{ uri: BG }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={["rgba(23,23,23,0.55)", "rgba(23,23,23,0.92)", C.surface]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl, flexGrow: 1 }}>
        <IconButton testID="age-gate-back" name="arrow-left" color={C.onSurface} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ marginLeft: -12 }} />
        <View style={{ flex: 1, justifyContent: "flex-end", paddingTop: 120 }}>
          <Eyebrow color={C.brandPrimary}>OpenBook After Dark — 18+</Eyebrow>
          <Text style={styles.heading} testID="age-gate-heading">AGE CONFIRMATION{"\n"}REQUIRED</Text>
          <Text style={styles.body}>This section contains literature intended for adults aged 18 and above.</Text>
          <Text style={[styles.body, { marginTop: space.lg }]}>By continuing, you confirm that:</Text>
          <Text style={styles.bullet}>•  You are at least 18 years old.</Text>
          <Text style={styles.bullet}>•  You are legally permitted to access this content in your location.</Text>
          <View style={styles.box}>
            <Checkbox testID="age-confirm-checkbox" colorsOverride={C} checked={checked} onToggle={() => setChecked(!checked)} label="I confirm that I am 18 years old or above." />
          </View>
          <Button testID="age-confirm-continue" colorsOverride={C} label="I AM 18+ — CONTINUE" disabled={!checked}
            onPress={async () => { await confirmAge(); }} style={{ backgroundColor: C.brandPrimary, borderColor: C.brandPrimary }} />
          <Button testID="age-gate-leave" colorsOverride={C} variant="ghost" label="Leave — return to the library" onPress={() => router.replace("/")} style={{ marginTop: space.sm }} />
          <Text style={styles.fine}>This is a self-declaration, not verified proof of age. Adult titles never appear in the general library, recommendations or default search.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Collection() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["after-dark"], queryFn: () => api<{ categories: { name: string; books: Book[] }[]; uncategorised: Book[] }>("/after-dark") });
  const total = q.data ? q.data.categories.reduce((n, c) => n + c.books.length, 0) + q.data.uncategorised.length : 0;
  return (
    <View style={styles.root} testID="after-dark-screen">
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + space.xs }]}>
        <IconButton testID="after-dark-back" name="arrow-left" color={C.onSurface} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text style={styles.headerTitle}>After Dark</Text>
        <IconButton testID="after-dark-leave" name="sun" color={C.brandPrimary} onPress={() => router.replace("/")} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.xl }}>
          <Eyebrow color={C.brandPrimary}>18+ · Separate collection</Eyebrow>
          <Text style={styles.title}>OpenBook{"\n"}After Dark</Text>
          <Text style={styles.body}>Adult fiction, mature romance and literary works for grown readers — kept entirely apart from the general library.</Text>
        </View>
        {q.isLoading && <StateView testID="after-dark-loading" kind="loading" />}
        {q.isError && <StateView testID="after-dark-error" kind="error" title="Could not open the collection" body={(q.error as Error).message} onRetry={() => q.refetch()} />}
        {q.data && total === 0 && (
          <View style={styles.empty} testID="after-dark-empty">
            <Text style={styles.emptyTitle}>No titles have been published here yet.</Text>
            <Text style={styles.fine}>Titles appear only after an administrator adds them with confirmed rights and an adult-content classification. Nothing is shown that is not legally available.</Text>
          </View>
        )}
        {total > 0 && q.data?.categories.filter((c) => c.books.length).map((c) => (
          <View key={c.name} style={{ marginTop: space.xxl }}>
            <Text style={styles.cat}>{c.name}</Text>
            <ShelfRow testID={`after-dark-${c.name}`} books={c.books} colorsOverride={C} />
          </View>
        ))}
        {!!q.data?.uncategorised.length && (
          <View style={{ marginTop: space.xxl }}>
            <Text style={styles.cat}>More titles</Text>
            <ShelfRow testID="after-dark-more" books={q.data.uncategorised} colorsOverride={C} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  heading: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 38, color: C.onSurface, marginTop: space.md, letterSpacing: 0.5 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: C.onSurface, opacity: 0.85, marginTop: space.md },
  bullet: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: C.onSurface, opacity: 0.85, marginTop: space.xs },
  box: { marginTop: space.xl, marginBottom: space.lg, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, backgroundColor: "rgba(35,35,35,0.8)" },
  fine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: C.muted, marginTop: space.lg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  headerTitle: { flex: 1, textAlign: "center", fontFamily: fonts.bold, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: C.onSurface },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: C.onSurface, marginTop: space.sm },
  empty: { margin: space.xl, padding: space.xl, borderRadius: radius.md, borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontFamily: fonts.displayItalic, fontSize: 18, color: C.onSurface },
  cat: { fontFamily: fonts.display, fontSize: 22, color: C.onSurface, paddingHorizontal: space.xl, marginBottom: space.lg },
});
