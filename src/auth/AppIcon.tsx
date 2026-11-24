import type { LucideIcon } from "lucide-react";

/** Lucide glyph inside the portal’s iOS-style squircle chip (dashboard launcher or page header). */
export function AppIcon({ icon: Icon, launcher }: { icon: LucideIcon; launcher?: boolean }) {
  const size = launcher ? 34 : 22;
  const stroke = launcher ? 2.1 : 2.15;
  const kind = launcher ? "portal-app-icon portal-tile-icon is-launcher" : "portal-app-icon portal-page-icon";
  return (
    <span className={kind}>
      <Icon size={size} strokeWidth={stroke} aria-hidden="true" />
    </span>
  );
}