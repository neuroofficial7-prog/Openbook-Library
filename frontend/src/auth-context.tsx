import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, setAgeConfirmed, setUserToken } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  preferred_language: string;
  favourite_categories: string[];
  adult_confirmed: boolean;
};

type Ctx = {
  user: User | null;
  ready: boolean;
  ageConfirmed: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (p: Partial<User>) => Promise<void>;
  confirmAge: () => Promise<void>;
  revokeAge: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as any);
const TOKEN_KEY = "auth_token";
const AGE_KEY = "age_confirmed";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [ageConfirmed, setAge] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
      setUserToken(null);
      await storage.secureRemove(TOKEN_KEY);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [tok, age] = await Promise.all([storage.secureGet<string | null>(TOKEN_KEY, null), storage.getItem(AGE_KEY, false)]);
      if (age) {
        setAge(true);
        setAgeConfirmed(true);
      }
      if (tok) {
        setUserToken(tok);
        await refresh();
      }
      setReady(true);
    })();
  }, [refresh]);

  const store = async (token: string, u: User) => {
    setUserToken(token);
    await storage.secureSet(TOKEN_KEY, token);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { email, password } });
    await store(r.token, r.user);
  };
  const register = async (name: string, email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/register", { method: "POST", body: { name, email, password } });
    await store(r.token, r.user);
  };
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    setUserToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
  };
  const updateProfile = async (p: Partial<User>) => {
    setUser(await api<User>("/auth/me", { method: "PATCH", body: p }));
  };
  const confirmAge = async () => {
    setAge(true);
    setAgeConfirmed(true);
    await storage.setItem(AGE_KEY, true);
    if (user) await updateProfile({ adult_confirmed: true }).catch(() => {});
  };
  const revokeAge = async () => {
    setAge(false);
    setAgeConfirmed(false);
    await storage.removeItem(AGE_KEY);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, ageConfirmed, login, register, logout, refresh, updateProfile, confirmAge, revokeAge }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
