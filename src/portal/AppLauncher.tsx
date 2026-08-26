import { Link } from "react-router-dom";
import { visibleMiniApps } from "./miniApps";
import { usePortalAuth } from "./AuthContext";

export default function AppLauncher() {
  const { user } = usePortalAuth();
  if (!user) return null;
  return <main className="launcher"><div className="launcher-heading"><span>UniqEnergy enterprise</span><h1>Mini apps</h1><p>Choose an application to begin.</p></div><section className="launcher-grid" aria-label="Available mini apps">{visibleMiniApps(user).map((app) => { const Icon = app.icon; return <Link key={app.id} to={app.path} className={`launcher-card ${app.id}`}><Icon/><span><b>{app.label}</b><small>{app.description}</small></span><em>Open →</em></Link>; })}</section></main>;
}
