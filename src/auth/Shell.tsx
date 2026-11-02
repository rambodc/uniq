import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "./AuthContext";
import { ICONS, miniAppById, type MiniAppId } from "./miniApps";
import { ThemeToggle } from "./Theme";

export default function Shell({ title, eyebrow, appId, back, watermark, children }: {
  title: string;
  eyebrow?: string;
  appId?: MiniAppId;
  back?: boolean;
  watermark?: boolean;
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const app = appId ? miniAppById(appId) : null;
  const Icon = app ? ICONS[app.icon] : null;
  return <div className={watermark ? "portal-shell portal-shell-mark" : "portal-shell"}>
    {watermark && <div className="portal-watermark" aria-hidden="true" />}
    <header className="portal-bar">
      <Link to="/dashboard" className="portal-brand">
        <img src="/brand/uniqenergy-mark-64.png" alt="" width={32} height={32} />
        <span>UniqEnergy</span>
      </Link>
      <div className="portal-bar-actions">
        <ThemeToggle />
        {profile?.firstName && <span className="portal-firstname">{profile.firstName}</span>}
      </div>
    </header>
    <main className="portal-main">
      {back && <Link className="portal-back-link" to="/dashboard"><ArrowLeft size={18} aria-hidden="true" /> Back</Link>}
      <div className="portal-page-head" style={app ? { "--accent": app.accent } as CSSProperties : undefined}>
        {Icon && <span className="portal-page-icon"><Icon size={26} aria-hidden="true" /></span>}
        <div>
          {eyebrow && <p className="portal-eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
        </div>
      </div>
      {children}
    </main>
  </div>;
}
