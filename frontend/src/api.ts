// Thin REST client for the OpenBook API. Tokens live in secure storage; this module
// keeps the current values in memory so every request can attach them.
export const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Availability = "READ ONLINE" | "READ AT SOURCE" | "BORROW TO READ" | "METADATA ONLY" | "NOT CURRENTLY AVAILABLE";

export type Book = {
  id: string;
  source_name: string;
  source_id: string;
  title: string;
  author: string;
  description: string;
  isbn: string[];
  publication_year: number | null;
  language: string;
  country?: string | null;
  subjects: string[];
  genre?: string | null;
  category?: string | null;
  publisher?: string | null;
  cover_url?: string | null;
  source_url?: string | null;
  reader_url?: string | null;
  format?: string | null;
  licence?: string | null;
  copyright_status?: string | null;
  access_type: string;
  availability: Availability;
  adult_content: boolean;
  also_at?: string[];
  author_years?: string;
  publication_status?: string;
};

const session = { user: null as string | null, admin: null as string | null, age: false };

export function setUserToken(t: string | null) {
  session.user = t;
}
export function setAdminToken(t: string | null) {
  session.admin = t;
}
export function setAgeConfirmed(v: boolean) {
  session.age = v;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((d: any) => `${(d.loc || []).slice(-1)[0] ?? ""}: ${String(d.msg || "").replace("Value error, ", "")}`)
      .join("\n");
  return "Something went wrong";
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; admin?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = opts.admin ? session.admin : session.user;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (session.age) headers["X-Age-Confirmed"] = "true";
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, detailText((data as any).detail));
  return data as T;
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
