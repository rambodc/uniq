import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Suspense, lazy } from "react";
import PublicSite from "./public/PublicSite";
import EnterpriseAuth from "./auth/EnterpriseAuth";
import InviteAccept from "./auth/InviteAccept";
import { AuthProvider, usePortalAuth } from "./portal/AuthContext";
import PortalLayout from "./portal/PortalLayout";
import AppLauncher from "./portal/AppLauncher";
import { canAccessMiniApp, type MiniAppId } from "./portal/miniApps";
import UserAccessApp from "./mini-apps/user-access/UserAccessApp";
import AccountApp from "./mini-apps/account/AccountApp";

const FluidLab = lazy(() => import("./mini-apps/fluidlab/FluidLab"));
const FluidPrograms = lazy(() => import("./mini-apps/fluid-programs/FluidPrograms"));

function Protected() { const { user, loading } = usePortalAuth(); if (loading) return <main className="route-loading"><span>Opening your UniqEnergy portal…</span></main>; return user ? <Outlet/> : <Navigate to={`/signin?returnTo=${encodeURIComponent(location.pathname)}`} replace/>; }
function AppAccess({ appId }: { appId: MiniAppId }) { const { user } = usePortalAuth(); return user && canAccessMiniApp(user, appId) ? <Outlet/> : <Navigate to="/portal" replace/>; }
function FluidLabEditor() { const { projectId = "" } = useParams(), navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading FluidLab…</main>}><FluidLab projectId={projectId} navigate={navigate} onDirtyChange={() => {}} exitRequest={0} onConfirmBrowserExit={() => navigate("/portal")}/></Suspense>; }
function FluidProgramsEditor() { const navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading Fluid Programs…</main>}><FluidPrograms navigate={navigate}/></Suspense>; }

export default function App() {
  return <AuthProvider><Routes><Route path="/signin" element={<EnterpriseAuth mode="signin"/>}/><Route path="/forgot-password" element={<EnterpriseAuth mode="forgot"/>}/><Route path="/invite/:token" element={<InviteAccept/>}/><Route path="/signup" element={<Navigate to="/signin" replace/>}/><Route element={<Protected/>}><Route element={<PortalLayout/>}><Route path="/portal" element={<AppLauncher/>}/><Route element={<AppAccess appId="user-access"/>}><Route path="/apps/user-access" element={<UserAccessApp/>}/></Route><Route path="/apps/account" element={<AccountApp/>}/></Route><Route element={<AppAccess appId="fluidlab"/>}><Route path="/apps/fluidlab" element={<FluidLabEditor/>}/><Route path="/apps/fluidlab/projects/:projectId" element={<FluidLabEditor/>}/></Route><Route element={<AppAccess appId="fluid-programs"/>}><Route path="/apps/fluid-programs" element={<FluidProgramsEditor/>}/><Route path="/apps/fluid-programs/projects/:projectId" element={<Navigate to="/apps/fluid-programs" replace/>}/></Route></Route><Route path="/account" element={<Navigate to="/portal" replace/>}/><Route path="/account/profile" element={<Navigate to="/apps/account" replace/>}/><Route path="/account/projects/:projectId/fluidlab" element={<LegacyProjectRedirect app="fluidlab"/>}/><Route path="/account/projects/:projectId/fluid-programs" element={<Navigate to="/apps/fluid-programs" replace/>}/><Route path="*" element={<PublicSite/>}/></Routes></AuthProvider>;
}

function LegacyProjectRedirect({ app }: { app: "fluidlab" }) { const { projectId } = useParams(); return <Navigate to={`/apps/${app}/projects/${projectId || ""}`} replace/>; }
