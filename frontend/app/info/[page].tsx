import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Eyebrow, IconButton } from "@/src/components/ui";
import { fonts, makeStyles, space } from "@/src/theme";

const PAGES: Record<string, { title: string; body: string[] }> = {
  about: { title: "About OpenBook", body: [
    "OpenBook Library is a worldwide digital book discovery and online reading platform. It brings together legally available books from open catalogues — Project Gutenberg, Open Library, the Internet Archive and the Directory of Open Access Books — into one calm, unified experience.",
    "A special mission of OpenBook is the Mizo Heritage Library: making Mizo literature, history, folklore and poetry more discoverable to readers everywhere, while respecting the rights of every author and publisher.",
  ] },
  contact: { title: "Contact", body: ["For questions, corrections, rights enquiries or to report a problem with a record, use “Submit a Book” for contributions, or reach the library team through the Help Centre.", "Rights holders who want a record removed or corrected will receive priority attention."] },
  privacy: { title: "Privacy Policy", body: [
    "Browsing the general library requires no account. If you create one, we store your email, display name, reading progress, bookmarks, saved books and reader settings so they sync across your devices.",
    "Passwords are stored only as secure one-way hashes. We do not sell personal data. Guest preferences and progress stay on your device.",
    "Searches are counted anonymously to show popular searches; they are not linked to your account.",
  ] },
  terms: { title: "Terms of Service", body: [
    "OpenBook provides discovery and online reading of works that are in the public domain, openly licensed, or shared with permission. External books are read at their original provider when required, under that provider's terms.",
    "Contributors must own or have permission to distribute any work they submit. Submissions are reviewed before publication and may be declined.",
    "The 18+ After Dark section is for adults only. Confirming your age is a self-declaration and you are responsible for complying with the laws of your location.",
  ] },
  copyright: { title: "Copyright Information", body: [
    "Every record shows its source and the rights or licence information that source provides. OpenBook does not offer unauthorised downloads and does not copy copyrighted texts without permission.",
    "Project Gutenberg texts are read inside OpenBook because they are in the public domain in the USA; check the copyright laws of your country. Other sources open in their official reader.",
    "If you believe a record infringes your rights, contact us and it will be reviewed promptly.",
  ] },
  help: { title: "Help Centre", body: [
    "READ ONLINE — read inside OpenBook. READ AT SOURCE — opens the provider's official reader. BORROW TO READ — the provider lends it, usually requiring a free account there. METADATA ONLY — a catalogue record without a readable copy. NOT CURRENTLY AVAILABLE — the source lists it but it cannot be read now.",
    "In the reader, tap the page to show or hide controls, swipe left or right to turn pages, and use the Aa button for themes, fonts, size, spacing, width, margins and reading modes.",
    "Forgot your password? Use “Forgot your password?” on the sign-in screen. If reset emails are not yet enabled, the library team can help you regain access.",
  ] },
};

export default function InfoPage() {
  const styles = useStyles();
  const { page } = useLocalSearchParams<{ page: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = PAGES[String(page)] ?? PAGES.about;
  return (
    <View style={styles.root} testID={`info-${page}-screen`}>
      <View style={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.sm }}>
        <IconButton testID="info-back-button" name="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl }}>
        <Eyebrow>OpenBook Library</Eyebrow>
        <Text style={styles.title} testID="info-title">{p.title}</Text>
        {p.body.map((t, i) => <Text key={i} style={styles.body}>{t}</Text>)}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: c.onSurface, marginTop: space.sm, marginBottom: space.lg },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26, color: c.onSurface, marginBottom: space.lg },
}));
