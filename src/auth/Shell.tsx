import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Shell({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  const { profile, logout } = useAuth();
  return <div className="portal-shell">
    <header className="portal-bar">
      <Link to="/dashboard" className="portal-brand">
        <img src="/brand/uniqenergy-mark-64.png" alt="" width={32} height={32} />
        <span>UniqEnergy</span>
      </Link>
      <div className="portal-bar-actions">
        {profile && <span>{profile.firstName} {profile.lastName}</span>}
        <button type="button" onClick={() => void logout()}>Sign out</button>
      </div>
    </header>
    <main className="portal-main">
      {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {children}
    </main>
  </div>;
}
