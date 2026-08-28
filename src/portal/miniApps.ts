import { Box, Shield, UserRound, type LucideIcon } from "lucide-react";
import type { PortalUser } from "../core/types";

export type MiniAppId = "fluidlab" | "user-access" | "account";
export interface MiniAppDefinition { id: MiniAppId; label: string; description: string; path: string; icon: LucideIcon; adminOnly?: boolean; alwaysVisible?: boolean }

export const MINI_APPS: MiniAppDefinition[] = [
  { id: "fluidlab", label: "FluidLab", description: "Build and manage conceptual measured-depth well profiles in 3D.", path: "/apps/fluidlab", icon: Box },
  { id: "user-access", label: "User Access", description: "Invite users and control access to UniqEnergy mini apps.", path: "/apps/user-access", icon: Shield, adminOnly: true },
  { id: "account", label: "Account", description: "Manage your profile and sign-in settings.", path: "/apps/account", icon: UserRound, alwaysVisible: true },
];

export function canAccessMiniApp(user: PortalUser, appId: MiniAppId) {
  const app = MINI_APPS.find((item) => item.id === appId);
  if (!app) return false;
  if (app.alwaysVisible || user.role === "admin") return true;
  if (app.adminOnly) return false;
  return user.enabledMiniApps.includes(app.id as "fluidlab");
}

export const visibleMiniApps = (user: PortalUser) => MINI_APPS.filter((app) => canAccessMiniApp(user, app.id));
