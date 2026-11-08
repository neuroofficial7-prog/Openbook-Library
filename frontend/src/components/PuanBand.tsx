import React from "react";
import { StyleSheet, View } from "react-native";

// Woven band inspired by the Mizo puan (Puanchei stripes). Textile colours are
// fixed cultural colours, identical in light and dark.
const STRIPES = ["#1A1A1A", "#B3302A", "#F3F0E9", "#1A1A1A", "#2B5D3A", "#1A1A1A", "#B3302A", "#E2C48E", "#1A1A1A"];

export function PuanBand({ height = 14 }: { height?: number }) {
  return (
    <View style={[styles.row, { height }]}>
      {Array.from({ length: 6 }).map((_, k) => (
        <View key={k} style={styles.group}>
          {STRIPES.map((c, i) => (
            <View key={i} style={{ flex: i % 3 === 0 ? 2 : 1, backgroundColor: c }} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", overflow: "hidden" },
  group: { flex: 1, flexDirection: "row" },
});
