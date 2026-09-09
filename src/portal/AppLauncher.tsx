import { Link } from "react-router-dom";
import { visibleMiniApps } from "./miniApps";
import { usePortalAuth } from "./AuthContext";

export default function AppLauncher() {
  const { user } = usePortalAuth();
  if (!user) return null;
  return <main className="launcher">
    <div className="launcher-brand"><img className="launcher-brand-symbol" src="/brand/uniqenergy-mark-256.png" alt=""/><span className="launcher-wordmark">Uniq<span>Energy</span></span></div>
    <div className="launcher-heading"><span>Your connected workspace</span><h1>One place. Every possibility.</h1><p>Choose a mini app to get started.</p></div>
    <section className="launcher-grid" aria-label="Available mini apps">{visibleMiniApps(user).map((app) => <Link key={app.id} to={app.path} className={`launcher-app ${app.id}`} aria-describedby={`app-description-${app.id}`}>
      <span className="launcher-app-art"><img src={`/portal-art/${app.id}.webp`} alt="" width={128} height={128}/></span>
      <b>{app.label}</b><small id={`app-description-${app.id}`}>{app.description}</small>
    </Link>)}</section>
    <p className="launcher-footnote">Your tools. Your energy.</p>
  </main>;
}
