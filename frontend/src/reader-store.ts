// Reader preferences + local reading progress (guests), synced for signed-in users.
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type ReaderSettings = {
  theme: "warm" | "cream" | "sepia" | "white" | "dark" | "midnight";
  font: "serif" | "sans" | "dyslexic";
  size: number;
  spacing: "compact" | "normal" | "relaxed" | "wide";
  width: "narrow" | "medium" | "wide";
  margin: "small" | "medium" | "large";
  mode: "paginated" | "scroll";
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "warm", font: "serif", size: 18, spacing: "normal", width: "medium", margin: "medium", mode: "paginated",
};

// Reading surfaces are paper colours chosen by the reader, not app chrome, so
// they are fixed values that do not follow the app's light/dark scheme.
export const READER_THEMES: Record<ReaderSettings["theme"], { label: string; bg: string; fg: string; sub: string }> = {
  warm: { label: "Warm Paper", bg: "#F3EBDD", fg: "#2A2520", sub: "#8A7F70" },
  cream: { label: "Cream", bg: "#FBF6E9", fg: "#2B2A26", sub: "#8D877A" },
  sepia: { label: "Sepia", bg: "#E9D9BC", fg: "#3B2E1E", sub: "#7D6A4F" },
  white: { label: "Pure White", bg: "#FFFFFF", fg: "#1C1C1C", sub: "#7A7A7A" },
  dark: { label: "Dark", bg: "#1E1E1E", fg: "#DCD6CC", sub: "#8F897F" },
  midnight: { label: "Midnight", bg: "#0E1420", fg: "#C9CFDA", sub: "#6F7889" },
};

export const LINE_HEIGHT = { compact: 1.35, normal: 1.6, relaxed: 1.85, wide: 2.1 };
export const MAX_WIDTH = { narrow: 480, medium: 640, wide: 2000 };
export const MARGIN = { small: 16, medium: 26, large: 40 };

const SETTINGS_KEY = "reader_settings";
const PROGRESS_KEY = "local_progress";

export type LocalProgress = { book_id: string; title: string; author: string; cover_url?: string | null; page: number; total: number; updated_at: string };

export async function loadSettings(signedIn: boolean): Promise<ReaderSettings> {
  const local = await storage.getItem<string | null>(SETTINGS_KEY, null);
  let s: ReaderSettings = { ...DEFAULT_SETTINGS, ...(local ? JSON.parse(local) : {}) };
  if (signedIn) {
    try {
      const remote = await api<Partial<ReaderSettings>>("/me/settings");
      if (remote && Object.keys(remote).length) s = { ...DEFAULT_SETTINGS, ...remote };
    } catch {}
  }
  return s;
}

export async function saveSettings(s: ReaderSettings, signedIn: boolean) {
  await storage.setItem(SETTINGS_KEY, JSON.stringify(s));
  if (signedIn) api("/me/settings", { method: "PUT", body: { settings: s } }).catch(() => {});
}

export async function localProgressAll(): Promise<Record<string, LocalProgress>> {
  const raw = await storage.getItem<string | null>(PROGRESS_KEY, null);
  return raw ? JSON.parse(raw) : {};
}

export async function saveProgress(p: Omit<LocalProgress, "updated_at">, signedIn: boolean) {
  const all = await localProgressAll();
  all[p.book_id] = { ...p, updated_at: new Date().toISOString() };
  await storage.setItem(PROGRESS_KEY, JSON.stringify(all));
  if (signedIn)
    api(`/me/progress/${encodeURIComponent(p.book_id)}`, {
      method: "PUT",
      body: { page: p.page, total: p.total, title: p.title, author: p.author, cover_url: p.cover_url ?? null, availability: "READ ONLINE" },
    }).catch(() => {});
}

export async function continueReading(signedIn: boolean): Promise<LocalProgress[]> {
  if (signedIn) {
    try {
      return await api<LocalProgress[]>("/me/progress");
    } catch {}
  }
  return Object.values(await localProgressAll()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

// Guest bookmarks
const BM_KEY = "local_bookmarks";
export type LocalBookmark = { id: string; book_id: string; page: number; title: string; note: string; created_at: string };
export async function localBookmarks(): Promise<LocalBookmark[]> {
  const raw = await storage.getItem<string | null>(BM_KEY, null);
  return raw ? JSON.parse(raw) : [];
}
export async function setLocalBookmarks(list: LocalBookmark[]) {
  await storage.setItem(BM_KEY, JSON.stringify(list));
}

const RECENT_KEY = "recent_searches";
export async function recentSearches(): Promise<string[]> {
  const raw = await storage.getItem<string | null>(RECENT_KEY, null);
  return raw ? JSON.parse(raw) : [];
}
export async function pushRecentSearch(q: string) {
  const list = (await recentSearches()).filter((x) => x.toLowerCase() !== q.toLowerCase());
  await storage.setItem(RECENT_KEY, JSON.stringify([q, ...list].slice(0, 8)));
}
export async function clearRecentSearches() {
  await storage.removeItem(RECENT_KEY);
}
