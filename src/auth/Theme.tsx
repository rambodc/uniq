import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { resolveTheme, THEME_STORAGE_KEY, type PortalTheme } from "./theme";

type ThemeState = { theme: PortalTheme; toggle: () => void };
const ThemeContext = createContext<ThemeState | null>(null);

function readStored() {
  try { return globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null; } catch { return null; }
}
function systemIsDark() {
  try { return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true; } catch { return true; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<string | null>(readStored);
  const [systemDark, setSystemDark] = useState(systemIsDark);
  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const sync = () => setSystemDark(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const theme = resolveTheme(stored, systemDark);
  const value = useMemo<ThemeState>(() => ({
    theme,
    toggle: () => {
      const next: PortalTheme = theme === "dark" ? "light" : "dark";
      try { globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode */ }
      setStored(next);
    },
  }), [theme]);
  return <ThemeContext.Provider value={value}><div className="portal-root" data-theme={theme}>{children}</div></ThemeContext.Provider>;
}

export function ThemeToggle() {
  const theme = useContext(ThemeContext);
  if (!theme) return null;
  const next = theme.theme === "dark" ? "light" : "dark";
  const Icon = theme.theme === "dark" ? Sun : Moon;
  return <button type="button" className="portal-theme" onClick={theme.toggle} aria-label={`Switch to ${next} theme`}><Icon size={18} aria-hidden="true" /></button>;
}
