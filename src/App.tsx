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
const PasonViewer = lazy(() => import("./public-tools/pason-viewer/PasonViewer"));

function Protected() { const { user, loading } = usePortalAuth(); if (loading) return <main className="route-loading"><span>Opening your UniqEnergy portal…</span></main>; return user ? <Outlet/> : <Navigate to="/signin" replace/>; }
function AppAccess({ appId }: { appId: MiniAppId }) { const { user } = usePortalAuth(); return user && canAccessMiniApp(user, appId) ? <Outlet/> : <Navigate to="/portal" replace/>; }
function FluidLabEditor() { const { projectId = "" } = useParams(), navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading FluidLab…</main>}><FluidLab projectId={projectId} navigate={navigate} onDirtyChange={() => {}} exitRequest={0} onConfirmBrowserExit={() => navigate("/portal")}/></Suspense>; }
function PasonViewerPage() { const navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading Pason Viewer…</main>}><PasonViewer navigate={navigate}/></Suspense>; }

export default function App() {
  return <AuthProvider><Routes><Route path="/pason-viewer" element={<PasonViewerPage/>}/><Route path="/signin" element={<EnterpriseAuth mode="signin"/>}/><Route path="/forgot-password" element={<EnterpriseAuth mode="forgot"/>}/><Route path="/invite/:token" element={<InviteAccept/>}/><Route element={<Protected/>}><Route element={<PortalLayout/>}><Route path="/portal" element={<AppLauncher/>}/><Route element={<AppAccess appId="user-access"/>}><Route path="/apps/user-access" element={<UserAccessApp/>}/></Route><Route path="/apps/account" element={<AccountApp/>}/></Route><Route element={<AppAccess appId="fluidlab"/>}><Route path="/apps/fluidlab" element={<FluidLabEditor/>}/><Route path="/apps/fluidlab/projects/:projectId" element={<FluidLabEditor/>}/></Route></Route><Route path="*" element={<PublicSite/>}/></Routes></AuthProvider>;
}
