export const THEME_STORAGE_KEY = "uniqenergy-portal-theme";
export type PortalTheme = "light" | "dark";

/** Stored choice wins. Otherwise follow the system preference. */
export function resolveTheme(stored: string | null, systemDark: boolean): PortalTheme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}
