import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { copiedLabel } from "./data";

export function WellsFrame({ copiedAt, children }: { copiedAt?: string; children: ReactNode }) {
  return <div className="wl">
    <div className="wl-wrap">
      <header className="wl-head">
        <Link className="wl-brand" to="/dashboard">
          <span className="wl-logo" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="#04201d" /></svg></span>
          <span>UniqEnergy<small>Wells · mini app</small></span>
        </Link>
        <div className="wl-copy">{copiedAt ? `Copied from the mud man app · ${copiedLabel(copiedAt)}` : "Copied from the mud man app"}</div>
      </header>
      {children}
    </div>
  </div>;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="wl-back" to={to}>{children}</Link>;
}
