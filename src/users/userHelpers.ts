// Pure helpers for the User Access mini app (no React, no Firebase), so they are easy to test.
import { MINI_APPS, type MiniAppId } from "../auth/miniApps";
import type { UserInput, UserRecord } from "../core/api";

export type UserFilter = "all" | "super_admin" | "staff" | "disabled" | "attention";
export const FILTERS: { id: UserFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "super_admin", label: "Super admins" },
  { id: "staff", label: "Staff" },
  { id: "disabled", label: "Disabled" },
  { id: "attention", label: "Invite issues" },
];
export const INVITE_PROBLEMS = new Set(["bounced", "complained", "failed"]);
export const EMPTY_USER: UserInput = { firstName: "", lastName: "", email: "", type: "staff", miniApps: [] };

export const appName = (id: MiniAppId) => MINI_APPS.find((app) => app.id === id)?.name || id;
export const fullName = (user: Pick<UserRecord, "firstName" | "lastName">) => `${user.firstName} ${user.lastName}`.trim();
export const needsAttention = (user: UserRecord) => !!user.invite && INVITE_PROBLEMS.has(user.invite.status);

export function matchesFilter(user: UserRecord, filter: UserFilter) {
  if (filter === "all") return true;
  if (filter === "disabled") return user.disabled;
  if (filter === "attention") return needsAttention(user);
  return user.type === filter;
}

/** Search matches every word against the name, email, type and mini app names. */
export function matchesSearch(user: UserRecord, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [user.firstName, user.lastName, user.email, user.type === "super_admin" ? "super admin" : "staff", ...user.miniApps.map(appName)].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function visibleUsers(users: UserRecord[], query: string, filter: UserFilter) {
  return users.filter((user) => matchesFilter(user, filter) && matchesSearch(user, query));
}

export function filterCounts(users: UserRecord[]) {
  return Object.fromEntries(FILTERS.map(({ id }) => [id, users.filter((user) => matchesFilter(user, id)).length])) as Record<UserFilter, number>;
}

/** The chips on a card: at most `max` mini app names, then how many more. */
export function appChips(ids: readonly MiniAppId[], max = 2) {
  const names = ids.map(appName);
  return { shown: names.slice(0, max), more: Math.max(0, names.length - max), all: names };
}

export type InviteTone = "ok" | "warn" | "danger" | "neutral";
export function inviteBadge(user: UserRecord): { label: string; tone: InviteTone } | null {
  if (!user.invite) return null;
  const status = user.invite.status;
  if (INVITE_PROBLEMS.has(status)) return { label: `Invite ${status}`, tone: "danger" };
  if (status === "delayed") return { label: "Invite delayed", tone: "warn" };
  if (status === "delivered") return { label: "Invite delivered", tone: "ok" };
  return { label: `Invite ${status}`, tone: "neutral" };
}

export function lastSeen(at: string | null, now = Date.now()) {
  if (!at) return "Never signed in";
  const days = Math.floor((now - Date.parse(at)) / 86_400_000);
  if (Number.isNaN(days)) return "Never signed in";
  if (days <= 0) return "Signed in today";
  if (days === 1) return "Signed in yesterday";
  if (days < 30) return `Signed in ${days} days ago`;
  return `Signed in ${new Date(at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`;
}

export type FieldErrors = Partial<Record<"firstName" | "lastName" | "email", string>>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** The same rules the server enforces, checked first so people see them beside the field. */
export function validateUser(input: UserInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.firstName.trim()) errors.firstName = "Enter a first name.";
  else if (input.firstName.trim().length > 60) errors.firstName = "Keep it under 60 characters.";
  if (!input.lastName.trim()) errors.lastName = "Enter a last name.";
  else if (input.lastName.trim().length > 60) errors.lastName = "Keep it under 60 characters.";
  if (!input.email.trim()) errors.email = "Enter an email address.";
  else if (!EMAIL.test(input.email.trim())) errors.email = "Enter a valid email address.";
  return errors;
}

/** What gets sent to the callable: trimmed, and super admins store no mini apps. */
export function cleanInput(input: UserInput): UserInput {
  return { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email.trim().toLowerCase(), type: input.type, miniApps: input.type === "staff" ? input.miniApps : [] };
}
