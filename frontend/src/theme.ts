// Design tokens for OpenBook Library. Keys match the "color" block of /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F3F0E9",
  onSurface: "#202020",
  surfaceSecondary: "#E8E4DC",
  onSurfaceSecondary: "#202020",
  surfaceTertiary: "#E2DDD2",
  onSurfaceTertiary: "#202020",
  surfaceInverse: "#171717",
  onSurfaceInverse: "#F3F0E9",
  muted: "#77736D",

  brand: "#A58A58",
  onBrand: "#FFFFFF",
  brandPrimary: "#A58A58",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#C2A878",
  onBrandSecondary: "#202020",
  brandTertiary: "#EADFCD",
  onBrandTertiary: "#202020",

  success: "#4A7A59",
  onSuccess: "#FFFFFF",
  warning: "#D9933B",
  onWarning: "#171717",
  error: "#A34343",
  onError: "#FFFFFF",
  info: "#77736D",
  onInfo: "#F3F0E9",

  border: "#D8D2C8",
  borderStrong: "#B8B2A8",
  divider: "#D8D2C8",

  // Library-specific
  shelf: "#E8E4DC", // shelf background wall
  plank: "#CFC6B6", // shelf plank top
  plankEdge: "#B9AE9A", // shelf plank front edge
  mizo: "#7A2E2A", // Mizo heritage accent (puan red)
  onMizo: "#F3F0E9",
  mizoTint: "#EFE2D8",
  scrim: "rgba(23,23,23,0.55)",
};

export type ThemeColors = typeof light;

const dark: ThemeColors = {
  surface: "#171717",
  onSurface: "#F3F0E9",
  surfaceSecondary: "#232323",
  onSurfaceSecondary: "#F3F0E9",
  surfaceTertiary: "#2C2B29",
  onSurfaceTertiary: "#E8E4DC",
  surfaceInverse: "#F3F0E9",
  onSurfaceInverse: "#171717",
  muted: "#A39E96",

  brand: "#A58A58",
  onBrand: "#171717",
  brandPrimary: "#A58A58",
  onBrandPrimary: "#171717",
  brandSecondary: "#8C7448",
  onBrandSecondary: "#F3F0E9",
  brandTertiary: "#3A3226",
  onBrandTertiary: "#EADFCD",

  success: "#6FA07E",
  onSuccess: "#171717",
  warning: "#D9933B",
  onWarning: "#171717",
  error: "#C96262",
  onError: "#171717",
  info: "#A39E96",
  onInfo: "#171717",

  border: "#34322F",
  borderStrong: "#4A4743",
  divider: "#2C2B29",

  shelf: "#1E1D1B",
  plank: "#3A342B",
  plankEdge: "#2A251F",
  mizo: "#B5524B",
  onMizo: "#F3F0E9",
  mizoTint: "#2A1E1C",
  scrim: "rgba(0,0,0,0.6)",
};

export const fonts = {
  display: "PlayfairDisplay-Regular",
  displayBold: "PlayfairDisplay-Bold",
  displayItalic: "PlayfairDisplay-Italic",
  body: "DMSans-Regular",
  medium: "DMSans-Medium",
  bold: "DMSans-Bold",
  dyslexic: "OpenDyslexic-Regular",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Forced palettes (After Dark always uses dark).
export const darkColors = dark;
