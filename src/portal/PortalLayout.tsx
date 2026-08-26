import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { usePortalAuth } from "./AuthContext";
import "./portal.css";

export default function PortalLayout() {
  const { user } = usePortalAuth(), location = useLocation();
  if (!user) return null;
  const launcher = location.pathname === "/portal";
  return <div className="portal-shell"><header className="portal-header"><Link className="portal-brand" to="/"><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy</span></Link><div>{!launcher && <Link className="portal-return" to="/portal"><ArrowLeft/>Back to mini apps</Link>}<span>{user.firstName || user.email}</span></div></header><Outlet/></div>;
}
