import type { LucideIcon } from "lucide-react";

const SIZE = 22;
const STROKE = 2.15;

/** Lucide glyph inside the portal’s iOS-style squircle chip (dashboard tiles and page headers). */
export function AppIcon({ icon: Icon, tile }: { icon: LucideIcon; tile?: boolean }) {
  return (
    <span className={tile ? "portal-app-icon portal-tile-icon" : "portal-app-icon portal-page-icon"}>
      <Icon size={SIZE} strokeWidth={STROKE} aria-hidden="true" />
    </span>
  );
}