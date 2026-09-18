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
import ContactFormApp from "./mini-apps/contact-form/ContactFormApp";

const InvoiceQb = lazy(() => import("./mini-apps/invoice-qb/InvoiceQb"));
const LsdFinder = lazy(() => import("./mini-apps/lsd-finder/LsdFinder"));
const FluidLab = lazy(() => import("./mini-apps/fluidlab/FluidLab"));

function Protected() { const { user, loading } = usePortalAuth(); if (loading) return <main className="route-loading"><span>Opening your UniqEnergy portal…</span></main>; return user?.status === "active" ? <Outlet/> : <Navigate to="/signin" replace/>; }
function AppAccess({ appId }: { appId: MiniAppId }) { const { user } = usePortalAuth(); return user && canAccessMiniApp(user, appId) ? <Outlet/> : <Navigate to="/portal" replace/>; }
function FluidLabEditor() { const { wellId = "" } = useParams(), navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading FluidLab…</main>}><FluidLab wellId={wellId} navigate={navigate}/></Suspense>; }

export default function App() {
  return <AuthProvider><Routes><Route path="/signin" element={<EnterpriseAuth mode="signin"/>}/><Route path="/forgot-password" element={<EnterpriseAuth mode="forgot"/>}/><Route path="/invite/:token" element={<InviteAccept/>}/><Route element={<Protected/>}><Route element={<PortalLayout/>}><Route path="/portal" element={<AppLauncher/>}/><Route element={<AppAccess appId="invoice-qb"/>}><Route path="/apps/invoice-qb" element={<Suspense fallback={<main className="route-loading">Opening Invoice QB…</main>}><InvoiceQb/></Suspense>}/></Route><Route element={<AppAccess appId="user-access"/>}><Route path="/apps/user-access" element={<UserAccessApp/>}/></Route><Route path="/apps/account" element={<AccountApp/>}/><Route element={<AppAccess appId="contact-form"/>}><Route path="/apps/contact-form" element={<ContactFormApp/>}/></Route></Route><Route element={<AppAccess appId="lsd-finder"/>}><Route path="/apps/lsd-finder" element={<Suspense fallback={<main className="route-loading">Opening LSD Finder…</main>}><LsdFinder/></Suspense>}/></Route><Route element={<AppAccess appId="fluidlab"/>}><Route path="/apps/fluidlab" element={<FluidLabEditor/>}/><Route path="/apps/fluidlab/wells/:wellId" element={<FluidLabEditor/>}/></Route></Route><Route path="*" element={<PublicSite/>}/></Routes></AuthProvider>;
}
