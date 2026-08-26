export type UserRole = "admin" | "user";
export type ManagedMiniAppId = "fluidlab" | "fluid-programs";

export interface PortalUser {
  schemaVersion: 1;
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: "active" | "disabled";
  enabledMiniApps: ManagedMiniAppId[];
}

export interface Invitation {
  id: string;
  schemaVersion: 1;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  enabledMiniApps: ManagedMiniAppId[];
  status: "pending" | "accepted" | "cancelled" | "expired";
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
