import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, authReady } from "../core/firebase";
import { getCurrentUser } from "../core/api";
import type { PortalUser } from "../core/types";

interface AuthState { firebaseUser: User | null; user: PortalUser | null; loading: boolean; refresh: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => { setUser(await getCurrentUser()); };
  useEffect(() => {
    let active = true;
    void authReady.then(() => onAuthStateChanged(auth, (current) => {
      if (!active) return;
      setFirebaseUser(current);
      if (!current) { setUser(null); setLoading(false); return; }
      setLoading(true);
      void getCurrentUser().then((profile) => { if (active) setUser(profile); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setLoading(false); });
    }));
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({ firebaseUser, user, loading, refresh }), [firebaseUser, user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePortalAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing"); return value; }
