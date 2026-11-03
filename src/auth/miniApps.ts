// Browser side of the mini-app registry. The list itself lives in functions/miniApps.js.
// Only the icon components are added here, because they cannot live in a server file.
import { CircleUserRound, Drill, Inbox, PackageSearch, ShieldCheck, type LucideIcon } from "lucide-react";
import { ASSIGNABLE_MINI_APP_IDS, MINI_APPS as REGISTRY, STAFF, SUPER_ADMIN, USER_TYPES } from "../../functions/miniApps.js";

export type MiniApp = (typeof REGISTRY)[number];
export type MiniAppId = MiniApp["id"];
export type UserType = (typeof USER_TYPES)[number];
export const MINI_APPS: readonly MiniApp[] = REGISTRY;
export { ASSIGNABLE_MINI_APP_IDS, STAFF, SUPER_ADMIN, USER_TYPES };

/** One component per icon name used in the registry; the compiler rejects a registry icon that is missing here. */
export const ICONS: Record<MiniApp["icon"], LucideIcon> = { CircleUserRound, Drill, Inbox, PackageSearch, ShieldCheck };
export const USER_TYPE_LABELS: Record<UserType, string> = { super_admin: "Super admin", staff: "Staff" };
export const miniAppById = (id: MiniAppId): MiniApp => MINI_APPS.find((app) => app.id === id)!;
