export type UserRole = "admin" | "user";
export type ManagedMiniAppId = "fluidlab" | "contact-form" | "lsd-finder";

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

export type ContactInquiryType = "operations" | "general" | "careers";
export interface ContactInquiry {
  id: string;
  schemaVersion: 1;
  inquiryType: ContactInquiryType;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  areaOfInterest?: string;
  linkedinUrl?: string;
  message: string;
  source: "public-contact";
  createdAt: string | null;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
}

export interface ContactInquiryCounts { all: number; operations: number; general: number; careers: number }
