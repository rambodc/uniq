import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, authReady } from "../core/firebase";
import { getAccess, type Access, type Profile } from "../core/api";
import type { MiniAppId, UserType } from "./miniApps";
import { accessErrorMessage } from "./signInMessages";

type AuthState = {
  user: User | null;
  loading: boolean;
  type: UserType | null;
  miniApps: MiniAppId[];
  profile: Profile | null;
  refreshAccess: () => Promise<void>;
  accessError: string | null;
  accessLoading: boolean;
  can: (app: MiniAppId) => boolean;
  logout: () => Promise<void>;
};
const NO_ACCESS: Access = { type: null, miniApps: [], profile: null };
const Context = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<{ uid: string; value: Access } | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    const fallback = window.setTimeout(() => { if (active) setLoading(false); }, 8_000);
    void authReady.then(() => {
      if (!active) return;
      stop = onAuthStateChanged(auth, (next) => {
        if (!active) return;
        window.clearTimeout(fallback);
        setUser(next);
        setLoading(false);
      });
    });
    return () => { active = false; window.clearTimeout(fallback); stop?.(); };
  }, []);

  const uid = user?.uid;
  const verified = user?.emailVerified === true;
  useEffect(() => {
    let active = true;
    if (!uid || !verified) return () => { active = false; };
    getAccess().then((result) => {
      if (active) { setAccess({ uid, value: result }); setAccessError(null); }
    }, (cause: unknown) => {
      if (active) { setAccess({ uid, value: NO_ACCESS }); setAccessError(accessErrorMessage(cause)); }
    });
    return () => { active = false; };
  }, [uid, verified]);

  const value = useMemo<AuthState>(() => {
    const ready = access && access.uid === uid ? access.value : null;
    const miniApps = ready?.miniApps ?? [];
    return {
      user,
      loading,
      type: ready?.type ?? null,
      miniApps,
      profile: ready?.profile ?? null,
      refreshAccess: async () => {
        const current = auth.currentUser?.uid;
        if (!current) return;
        setAccess({ uid: current, value: await getAccess() });
      },
      accessError,
      accessLoading: Boolean(user && verified && !ready),
      can: (app) => miniApps.includes(app),
      logout: () => signOut(auth),
    };
  }, [user, loading, uid, verified, access, accessError]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
