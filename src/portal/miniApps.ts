import { Box, MessagesSquare, Shield, UserRound, type LucideIcon } from "lucide-react";
import type { ManagedMiniAppId, PortalUser } from "../core/types";

export type MiniAppId = ManagedMiniAppId | "user-access" | "account";
export interface MiniAppDefinition { id: MiniAppId; label: string; description: string; path: string; icon: LucideIcon; adminOnly?: boolean; alwaysVisible?: boolean }

export const MINI_APPS: MiniAppDefinition[] = [
  { id: "fluidlab", label: "FluidLab", description: "Explore your well in 3D, with costs, mud reports, and AI answers alongside.", path: "/apps/fluidlab", icon: Box },
  { id: "contact-form", label: "Contact Form", description: "Review and archive inquiries received from the public contact page.", path: "/apps/contact-form", icon: MessagesSquare },
  { id: "user-access", label: "User Access", description: "Invite users and control access to UniqEnergy mini apps.", path: "/apps/user-access", icon: Shield, adminOnly: true },
  { id: "account", label: "Account", description: "Manage your profile and sign-in settings.", path: "/apps/account", icon: UserRound, alwaysVisible: true },
];

export function canAccessMiniApp(user: PortalUser, appId: MiniAppId) {
  if (user.status !== "active") return false;
  const app = MINI_APPS.find((item) => item.id === appId);
  if (!app) return false;
  if (app.alwaysVisible || user.role === "admin") return true;
  if (app.adminOnly) return false;
  return user.enabledMiniApps.includes(app.id as ManagedMiniAppId);
}

export const visibleMiniApps = (user: PortalUser) => MINI_APPS.filter((app) => canAccessMiniApp(user, app.id));
