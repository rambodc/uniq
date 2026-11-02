// Single source of truth for the private workspace's mini apps and user types.
// Read by the Cloud Functions (access checks, user validation) and by the browser (dashboard tiles, route guards,
// private-path lists, the Users screen), so a mini app is added or changed in exactly one place: this file.
//
// Add a mini app:  1) add one entry to MINI_APPS below (name, description, route, icon, accent colour)
//                  2) guard its callables with requireMiniApp(request, "<id>")   (functions/core.js)
//                  3) add its routes inside <RequireMiniApp app="<id>"> in src/App.tsx and a noindex header in firebase.json
//                  4) add its icon to ICONS in src/auth/miniApps.ts if it uses a new one
// Tests fail if any of these is forgotten. Super admins get every mini app in this list automatically.
//
// Three kinds of mini app:
//   assignable        (default)          a super admin picks, per staff user, which of these they can open
//   `superAdminOnly`                     only super admins ever see or use it; it can never be given to staff
//   `everyone`                           every signed-in user has it automatically; it is never assigned or removed
// `accent` is the tile colour (a hex). Order here is the dashboard order. Profile is always first, for everyone.

export const MINI_APPS = /** @type {const} */ ([
  { id: "profile", name: "Profile", description: "Your name, email, photo and password.", route: "/profile", icon: "CircleUserRound", accent: "#1ce7be", superAdminOnly: false, everyone: true },
  { id: "contact", name: "Contact Form", description: "Messages received through uniqenergy.com.", route: "/contact-inbox", icon: "Inbox", accent: "#32c9ed", superAdminOnly: false, everyone: false },
  { id: "users", name: "User Access", description: "Invite people, edit their details, and choose which mini apps each one can open.", route: "/users", icon: "ShieldCheck", accent: "#7aa2ff", superAdminOnly: true, everyone: false },
]);

export const SUPER_ADMIN = "super_admin";
export const STAFF = "staff";
/** `super_admin` sees every mini app; `staff` sees only the mini apps assigned on their record. */
export const USER_TYPES = /** @type {const} */ ([SUPER_ADMIN, STAFF]);

export const MINI_APP_IDS = MINI_APPS.map((app) => app.id);
/** The mini apps a super admin may hand to a staff user (not the super-admin-only ones, and not the ones everyone already has). */
export const ASSIGNABLE_MINI_APP_IDS = MINI_APPS.filter((app) => !app.superAdminOnly && !app.everyone).map((app) => app.id);
/** The mini apps every signed-in user has, whatever their type or assignment. */
export const EVERYONE_MINI_APP_IDS = MINI_APPS.filter((app) => app.everyone).map((app) => app.id);

/** The mini apps an account can open, in registry order: all of them for a super admin; for staff the ones everyone has plus the assigned assignable ones. */
export function miniAppsFor(type, assigned) {
  if (type === SUPER_ADMIN) return [...MINI_APP_IDS];
  return MINI_APPS.filter((app) => app.everyone || (ASSIGNABLE_MINI_APP_IDS.includes(app.id) && Array.isArray(assigned) && assigned.includes(app.id))).map((app) => app.id);
}
