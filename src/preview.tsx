import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import type { AuthState } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./auth/Theme";
import Dashboard from "./auth/Dashboard";
import ContactInbox from "./contact/ContactInbox";
import UsersApp from "./users/UsersApp";
import ProfileApp from "./profile/ProfileApp";
import type { Inquiry, UserRecord } from "./core/api";
import "./styles.css";
import "./auth/portal.css";

const profile = { firstName: "Rambod", lastName: "Admin", email: "rambodr@uniquem.ca", photo: null as string | null };
const authState = {
  user: { emailVerified: true },
  loading: false,
  type: "super_admin",
  miniApps: ["profile", "contact", "users"],
  profile,
  refreshAccess: async () => {},
  accessError: null,
  accessLoading: false,
  can: () => true,
  logout: async () => {},
} as unknown as AuthState;
const inquiries: Inquiry[] = [
  { id: "1", inquiryType: "operations", productName: "Elixir", name: "Dana Cole", email: "dana@northline.ca", company: "Northline Energy", phone: "(403) 555-0142", message: "We are planning a Montney well and want to talk through Elixir in a water-based system.", createdAt: "2026-10-28T15:00:00.000Z", archived: false },
  { id: "2", inquiryType: "careers", name: "Sam Patel", email: "sam@example.com", message: "I would like to introduce myself for field work in Alberta.", createdAt: "2026-10-12T15:00:00.000Z", archived: false, legacy: { areaOfInterest: "Field engineering", linkedinUrl: "https://linkedin.com/in/sampatel" } },
  { id: "3", inquiryType: "general", name: "Riley Cho", email: "riley@example.com", message: "Please send the Calgary office hours.", createdAt: "2026-09-02T15:00:00.000Z", archived: true },
];
const users: UserRecord[] = [
  { uid: "you", firstName: "Rambod", lastName: "Admin", photo: null, email: "rambodr@uniquem.ca", type: "super_admin", miniApps: [], disabled: false, createdAt: null, updatedAt: null, createdBy: "wipe-script", invite: null, lastSignInAt: "2026-11-02T18:00:00.000Z", you: true },
  { uid: "ann", firstName: "Ann", lastName: "Nguyen", photo: null, email: "ann@uniqenergy.com", type: "staff", miniApps: ["contact"], disabled: false, createdAt: null, updatedAt: null, createdBy: "rambodr@uniquem.ca", invite: { status: "delivered", at: "2026-11-01T12:00:00.000Z", by: "rambodr@uniquem.ca", error: null, checkedAt: null }, lastSignInAt: null, you: false },
];
Object.assign(globalThis, { __UNIQ_PREVIEW__: true, __UNIQ_PREVIEW_AUTH__: authState, __UNIQ_PREVIEW_DATA__: { inquiries, users } });

createRoot(document.getElementById("root")!).render(<StrictMode><HashRouter><AuthProvider><ThemeProvider><Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/contact-inbox" element={<ContactInbox />} />
  <Route path="/users" element={<UsersApp />} />
  <Route path="/profile" element={<ProfileApp />} />
</Routes></ThemeProvider></AuthProvider></HashRouter></StrictMode>);
