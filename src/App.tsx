import { Navigate, Outlet, Route, Routes, useNavigate, useParams, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import PublicSite from "./public/PublicSite";
import EnterpriseAuth from "./auth/EnterpriseAuth";
import MemberHome, { MemberLayout } from "./member/MemberHome";
import PartyPage from "./member/PartyPage";
import UexApp from "./mini-apps/uex/UexApp";
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

function Protected() { const { user, loading } = usePortalAuth(), location = useLocation(); if (loading) return <main className="route-loading"><span>Opening your UniqEnergy portal…</span></main>; if (!user || user.status !== "active" || !user.firstName || !user.lastName) return <Navigate to={`/signin${location.pathname.startsWith("/member/parties/") ? `?next=${encodeURIComponent(location.pathname)}` : ""}`} replace/>; return <Outlet/>; }
function StaffOnly() { const { user } = usePortalAuth(); return user?.role === "member" ? <Navigate to="/member" replace/> : <Outlet/>; }
function AppAccess({ appId }: { appId: MiniAppId }) { const { user } = usePortalAuth(); return user && canAccessMiniApp(user, appId) ? <Outlet/> : <Navigate to={user?.role === "member" ? "/member" : "/portal"} replace/>; }
function FluidLabEditor() { const { wellId = "" } = useParams(), navigate = useNavigate(); return <Suspense fallback={<main className="route-loading">Loading FluidLab…</main>}><FluidLab wellId={wellId} navigate={navigate}/></Suspense>; }

function RouteMetadata() {
 const { pathname } = useLocation();
 useEffect(() => {
  const privatePage = /^\/(signin|member|portal|apps)(\/|$)/.test(pathname);
  let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (privatePage) {
   if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); }
   robots.content = "noindex, nofollow";
   document.title = pathname.startsWith("/apps/uex") ? "UEX | UniqEnergy" : "UniqAccount | UniqEnergy";
  } else { robots?.remove(); }
 }, [pathname]);
 return null;
}
export default function App() {
 return <AuthProvider><RouteMetadata/><Routes>
 <Route path="/signin" element={<EnterpriseAuth/>}/>
 <Route element={<Protected/>}>
  <Route element={<MemberLayout/>}><Route path="/member" element={<MemberHome/>}/><Route path="/member/account" element={<AccountApp/>}/><Route path="/member/parties/:id" element={<PartyPage/>}/></Route>
  <Route path="/apps/lsd-finder" element={<Suspense fallback={<main className="route-loading">Opening LSD Finder…</main>}><LsdFinder/></Suspense>}/>
  <Route element={<StaffOnly/>}><Route element={<PortalLayout/>}>
   <Route path="/portal" element={<AppLauncher/>}/>
   <Route path="/apps/account" element={<AccountApp/>}/>
   <Route element={<AppAccess appId="uex"/>}><Route path="/apps/uex" element={<UexApp/>}/></Route>
   <Route element={<AppAccess appId="invoice-qb"/>}><Route path="/apps/invoice-qb" element={<Suspense fallback={<main className="route-loading">Opening Invoice QB…</main>}><InvoiceQb/></Suspense>}/></Route>
   <Route element={<AppAccess appId="user-access"/>}><Route path="/apps/user-access" element={<UserAccessApp/>}/></Route>
   <Route element={<AppAccess appId="contact-form"/>}><Route path="/apps/contact-form" element={<ContactFormApp/>}/></Route>
  </Route><Route element={<AppAccess appId="fluidlab"/>}><Route path="/apps/fluidlab" element={<FluidLabEditor/>}/><Route path="/apps/fluidlab/wells/:wellId" element={<FluidLabEditor/>}/></Route></Route>
 </Route><Route path="*" element={<PublicSite/>}/>
 </Routes></AuthProvider>;
}
