import React, { createContext, useContext, useEffect, useState } from "react";

import { api, setAdminToken } from "@/src/api";
import type { User } from "@/src/auth-context";
import { storage } from "@/src/utils/storage";

type Ctx = { admin: User | null; ready: boolean; login: (e: string, p: string) => Promise<void>; logout: () => Promise<void>; can: (...roles: string[]) => boolean };
const AdminCtx = createContext<Ctx>(null as any);
export const useAdmin = () => useContext(AdminCtx);
const KEY = "admin_token";
const STAFF = ["super_admin", "admin", "editor"];

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string | null>(KEY, null);
      if (t) {
        setAdminToken(t);
        try {
          const u = await api<User>("/auth/me", { admin: true });
          if (u.roles.some((r) => STAFF.includes(r))) setAdmin(u);
        } catch {
          setAdminToken(null);
          await storage.secureRemove(KEY);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/admin/login", { method: "POST", body: { email, password } });
    setAdminToken(r.token);
    await storage.secureSet(KEY, r.token);
    setAdmin(r.user);
  };
  const logout = async () => {
    setAdminToken(null);
    await storage.secureRemove(KEY);
    setAdmin(null);
  };
  const can = (...roles: string[]) => !!admin?.roles.some((r) => roles.includes(r));

  return <AdminCtx.Provider value={{ admin, ready, login, logout, can }}>{ready ? children : null}</AdminCtx.Provider>;
}
