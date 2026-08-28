import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, authReady } from "../core/firebase";
import { getCurrentUser } from "../core/api";
import type { PortalUser } from "../core/types";

interface AuthState { user: PortalUser | null; loading: boolean; refresh: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<{ uid: string; promise: Promise<PortalUser> } | null>(null), sequence = useRef(0);
  const loadProfile = useCallback((uid: string) => {
    if (requestRef.current?.uid === uid) return requestRef.current.promise;
    const promise = (async () => {
      const delays = [0, 250, 750];
      let failure: unknown;
      for (const delay of delays) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        try { return await getCurrentUser(); }
        catch (error) {
          failure = error;
          const code = String((error as { code?: string })?.code || "");
          if (/permission-denied|unauthenticated|not-found|failed-precondition/.test(code)) break;
        }
      }
      throw failure;
    })().finally(() => { if (requestRef.current?.promise === promise) requestRef.current = null; });
    requestRef.current = { uid, promise };
    return promise;
  }, []);
  const refresh = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) { setUser(null); return; }
    const request = ++sequence.current;
    try {
      const profile = await loadProfile(current.uid);
      if (request === sequence.current && auth.currentUser?.uid === current.uid) setUser(profile);
    } catch {
      if (request === sequence.current && auth.currentUser?.uid === current.uid) { setUser(null); await signOut(auth); }
      throw new Error("The account session could not be loaded.");
    }
  }, [loadProfile]);
  useEffect(() => {
    let active = true, unsubscribe: (() => void) | undefined;
    void authReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, (current) => {
        const request = ++sequence.current;
        if (!active) return;
        if (!current) { setUser(null); setLoading(false); return; }
        setLoading(true);
        void loadProfile(current.uid).then((profile) => {
          if (active && request === sequence.current && auth.currentUser?.uid === current.uid) setUser(profile);
        }).catch(async () => {
          if (active && request === sequence.current && auth.currentUser?.uid === current.uid) { setUser(null); await signOut(auth); }
        }).finally(() => {
          if (active && request === sequence.current) setLoading(false);
        });
      });
    });
    return () => { active = false; unsubscribe?.(); };
  }, [loadProfile]);
  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePortalAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
