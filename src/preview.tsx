import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import type { AuthState } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./auth/Theme";
import Dashboard from "./auth/Dashboard";
import ContactInbox from "./contact/ContactInbox";
import ContactDetail from "./contact/ContactDetail";
import UsersApp from "./users/UsersApp";
import ProfileApp from "./profile/ProfileApp";
import type { Inquiry, UserRecord } from "./core/api";
import InventoryApp from "./inventory/InventoryApp";
import { inventoryPreview } from "./inventory/previewData";
import "./styles.css";
import "./auth/portal.css";

const profile = { firstName: "Rambod", lastName: "Admin", email: "rambodr@uniquem.ca", photo: null as string | null };
const authState = {
  user: { emailVerified: true },
  loading: false,
  type: "super_admin",
  miniApps: ["profile", "contact", "inventoryBot", "users"],
  profile,
  refreshAccess: async () => {},
  accessError: null,
  accessLoading: false,
  can: () => true,
  logout: async () => {},
} as unknown as AuthState;
const inquiries: Inquiry[] = [
  { id: "dana", inquiryType: "operations", productName: "Elixir", name: "Dana Cole", email: "dana@northline.ca", company: "Northline Energy", phone: "(403) 555-0142", message: "We are planning a Montney well and want to talk through Elixir in a water-based system before the winter program.", createdAt: "2026-10-28T15:00:00.000Z", archived: false },
  { id: "jordan", inquiryType: "product", productName: "Elixir", name: "Jordan Wells", email: "jordan@basinlab.ca", company: "Basin Lab", phone: "(587) 555-0198", message: "Can you share the typical dosage and compatibility notes for Elixir when the base fluid is a saturated brine?", createdAt: "2026-10-20T18:30:00.000Z", archived: false },
  { id: "sam", inquiryType: "careers", name: "Sam Patel", email: "sam@example.com", company: "Independent", message: "I would like to introduce myself for field work in Alberta. I have six seasons of drilling-fluid experience and can start after spring breakup.", createdAt: "2026-10-12T15:00:00.000Z", archived: false, legacy: { areaOfInterest: "Field engineering", linkedinUrl: "https://linkedin.com/in/sampatel", status: "new", source: "public-contact" } },
  { id: "priya", inquiryType: "operations", name: "Priya Shah", email: "priya@example.com", company: "Foothills Drilling", message: "We need a site visit in Grande Prairie the week of November 10 to review losses on the intermediate section.", createdAt: "2026-09-18T16:10:00.000Z", archived: false },
  { id: "casey", inquiryType: "general", name: "Casey Ng", email: "casey@example.com", message: "Please send the Calgary office hours and the best person to call about a product trial.", createdAt: "2026-08-14T13:00:00.000Z", archived: false },
  { id: "riley", inquiryType: "general", name: "Riley Cho", email: "riley@example.com", company: "Cho Consulting", message: "Following up on the archived note about the downtown office.", createdAt: "2026-09-02T15:00:00.000Z", archived: true, legacy: { areaOfInterest: "Office", status: "closed", source: "public-contact" } },
];
const users: UserRecord[] = [
  { uid: "you", firstName: "Rambod", lastName: "Admin", photo: null, email: "rambodr@uniquem.ca", type: "super_admin", miniApps: [], disabled: false, createdAt: null, updatedAt: null, createdBy: "wipe-script", invite: null, lastSignInAt: "2026-11-02T18:00:00.000Z", you: true },
  { uid: "ann", firstName: "Ann", lastName: "Nguyen", photo: null, email: "ann@uniqenergy.com", type: "staff", miniApps: ["contact"], disabled: false, createdAt: null, updatedAt: null, createdBy: "rambodr@uniquem.ca", invite: { status: "delivered", at: "2026-11-01T12:00:00.000Z", by: "rambodr@uniquem.ca", error: null, checkedAt: null }, lastSignInAt: null, you: false },
];
Object.assign(globalThis, { __UNIQ_PREVIEW__: true, __UNIQ_PREVIEW_AUTH__: authState, __UNIQ_PREVIEW_DATA__: { inquiries, users, inventory: inventoryPreview } });

createRoot(document.getElementById("root")!).render(<StrictMode><HashRouter><AuthProvider><ThemeProvider><Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/contact-inbox" element={<ContactInbox />} />
  <Route path="/contact-inbox/:inquiryId" element={<ContactDetail />} />
  <Route path="/users" element={<UsersApp />} />
  <Route path="/profile" element={<ProfileApp />} />
  <Route path="/inventory-bot/*" element={<InventoryApp />} />
</Routes></ThemeProvider></AuthProvider></HashRouter></StrictMode>);
