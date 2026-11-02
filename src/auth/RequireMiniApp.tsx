import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import LoadingScreen from "./LoadingScreen";
import { NOT_AUTHORIZED } from "./signInMessages";
import type { MiniAppId } from "./miniApps";

/** Route guard. Without `app` it only needs an account with access (the dashboard). The server enforces access again on every call. */
export default function RequireMiniApp({ app }: { app?: MiniAppId }) {
  const { user, loading, type, accessLoading, accessError, can, logout } = useAuth();
  const location = useLocation();
  if (loading || accessLoading) return <LoadingScreen />;
  if (!user || !user.emailVerified) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!type && accessError) return <main className="portal-center"><div><p>{accessError}</p><button type="button" className="button-primary" onClick={() => window.location.reload()}>Retry</button></div></main>;
  if (!type) return <main className="portal-center"><div><p>{NOT_AUTHORIZED}</p><button type="button" className="portal-text-button" onClick={() => void logout()}>Sign out</button></div></main>;
  if (app && !can(app)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
