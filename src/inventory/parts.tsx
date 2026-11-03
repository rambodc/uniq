import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function pretty(date: string) {
  if (!date) return "";
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function pulledLabel(value: string) {
  if (!value) return "No Xpress pull recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return `Last Xpress pull: ${value.slice(0, 10)}`;
  return `Last Xpress pull: ${parsed.toLocaleString("en-US", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} MT`;
}

export function dot(tone: string) {
  if (tone === "green") return "g";
  if (tone === "amber") return "a";
  if (tone === "red") return "r";
  return "n";
}

export function Rig() {
  return <svg className="xb-rig" viewBox="0 0 80 80" aria-hidden="true">
    <ellipse cx="40" cy="72" rx="30" ry="6" fill="#000" opacity=".35" />
    <polygon points="14,66 40,58 66,66 40,74" fill="#1e3a5f" stroke="#2f5b8a" />
    <polygon points="28,64 38,10 42,10 36,66" fill="#5eead4" />
    <polygon points="52,64 42,10 38,10 44,66" fill="#0e7490" />
    <rect x="35" y="6" width="10" height="5" rx="1" fill="#f59e0b" />
  </svg>;
}

export function InventoryFrame({ pulledAt, children }: { pulledAt?: string; children: ReactNode }) {
  return <div className="xb">
    <div className="xb-wrap">
      <header className="xb-head">
        <Link className="xb-brand" to="/dashboard">
          <span className="xb-logo" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="#04201d" /></svg></span>
          <span>UniqEnergy<small>Inventory Bot · field delivery check</small></span>
        </Link>
        <div className="xb-pull">{pulledLabel(pulledAt || "")}</div>
      </header>
      {children}
    </div>
  </div>;
}

export function BackToBoard() {
  return <Link className="xb-back" to="/inventory-bot">← Back to board</Link>;
}
