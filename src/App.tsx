import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import PublicSite from "./public/PublicSite";
import { AuthProvider } from "./auth/AuthContext";
import SignIn from "./auth/SignIn";
import RequireMiniApp from "./auth/RequireMiniApp";
import Dashboard from "./auth/Dashboard";
import ContactInbox from "./contact/ContactInbox";
import UsersApp from "./users/UsersApp";
import ProfileApp from "./profile/ProfileApp";
import { isPrivatePage } from "./auth/privatePaths";
import "./auth/portal.css";

function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const privatePage = isPrivatePage(pathname);
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!privatePage) return;
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots); }
    robots.content = "noindex, nofollow";
    document.title = "Workspace | UniqEnergy";
  }, [pathname]);
  return null;
}

export default function App() {
  return <AuthProvider><RouteMetadata /><Routes>
    <Route path="/signin" element={<SignIn />} />
    <Route element={<RequireMiniApp />}><Route path="/dashboard" element={<Dashboard />} /></Route>
    <Route element={<RequireMiniApp app="contact" />}><Route path="/contact-inbox" element={<ContactInbox />} /></Route>
    <Route element={<RequireMiniApp app="users" />}><Route path="/users" element={<UsersApp />} /></Route>
    <Route element={<RequireMiniApp app="profile" />}><Route path="/profile" element={<ProfileApp />} /></Route>
    <Route path="*" element={<PublicSite />} />
  </Routes></AuthProvider>;
}
