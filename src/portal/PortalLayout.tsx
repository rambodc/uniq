import { LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../core/firebase";
import { MINI_APPS, canAccessMiniApp } from "./miniApps";
import { usePortalAuth } from "./AuthContext";
import "./portal.css";

export default function PortalLayout() {
  const { user } = usePortalAuth(), navigate = useNavigate(), location = useLocation();
  if (!user) return null;
  const current = MINI_APPS.find((app) => location.pathname.startsWith(app.path));
  return <div className="portal-shell"><header className="portal-header"><Link className="portal-brand" to="/portal"><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy</span></Link><div><span>{user.firstName || user.email}</span><button aria-label="Sign out" onClick={() => void signOut(auth).then(() => navigate("/signin"))}><LogOut/></button></div></header>{current && <nav className="portal-nav" aria-label="Mini apps"><Link to="/portal">Mini apps</Link>{MINI_APPS.filter((app) => canAccessMiniApp(user, app.id)).map((app) => <Link className={app.id === current.id ? "active" : ""} key={app.id} to={app.path}>{app.label}</Link>)}</nav>}<Outlet/></div>;
}
