import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { usePortalAuth } from "./AuthContext";
import "./portal.css";

export default function PortalLayout() {
  const { user } = usePortalAuth(), location = useLocation();
  if (!user) return null;
  const launcher = location.pathname === "/portal";
  return <div className={`portal-shell${launcher ? " portal-launcher-shell" : ""}`}><header className="portal-header"><div className="portal-header-start">{!launcher && <Link className="portal-back-button" to="/portal" aria-label="Back to mini apps" title="Back to mini apps"><ArrowLeft/></Link>}<img className="portal-brand-mark" src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/></div><div><span>{user.firstName || user.email}</span></div></header><Outlet/></div>;
}
