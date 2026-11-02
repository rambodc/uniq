import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { MiniAppId, UserType } from "../auth/miniApps";

const isRead = (name: string) => /^(list|get)[A-Z]/.test(name);
const retryable = (error: unknown) => /deadline-exceeded|unavailable|internal/.test(String((error as { code?: string })?.code ?? ""));
async function invoke<TRequest, TResponse>(name: string, data?: TRequest) {
  const call = () => httpsCallable<TRequest, TResponse>(functions, name, { timeout: isRead(name) ? 20_000 : 30_000 })(data as TRequest);
  try { return (await call()).data; } catch (error) {
    if (!isRead(name) || !retryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return (await call()).data;
  }
}

export function messageOf(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  if (!message || code.endsWith("internal")) return fallback;
  return message;
}

export type InquiryLegacy = Record<string, unknown>;
export type Inquiry = { id: string; inquiryType: string; productName?: string; name: string; email?: string; company?: string; phone?: string; message: string; createdAt: string | null; archived: boolean; legacy?: InquiryLegacy };
export type InquiryList = { inquiries: Inquiry[]; total: number; nextCursor: null };
export const listContactInquiries = (data: { archived: boolean; query?: string }) => invoke<typeof data, InquiryList>("listContactInquiries", data);
export const archiveContactInquiry = (inquiryId: string) => invoke("archiveContactInquiry", { inquiryId });
export const restoreContactInquiry = (inquiryId: string) => invoke("restoreContactInquiry", { inquiryId });

export type Profile = { firstName: string; lastName: string; email: string; photo: string | null };
export type Access = { type: UserType | null; miniApps: MiniAppId[]; profile: Profile | null };
export const getAccess = () => invoke<undefined, Access>("getAccess");

export type InviteStatus = "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed";
export type UserInvite = { status: InviteStatus; at: string | null; by: string; error: string | null; checkedAt: string | null };
export type InviteResult = { sent: true; id: string } | { sent: false; reason: string };
export type UserRecord = { uid: string; firstName: string; lastName: string; photo: string | null; email: string; type: UserType; miniApps: MiniAppId[]; disabled: boolean; createdAt: string | null; updatedAt: string | null; createdBy: string; invite: UserInvite | null; lastSignInAt: string | null; you: boolean };
export type UserInput = { firstName: string; lastName: string; email: string; type: UserType; miniApps: MiniAppId[] };
export const listUsers = () => invoke<undefined, { users: UserRecord[] }>("listUsers");
export const createUser = (data: UserInput) => invoke<typeof data, { uid: string; email: string; invite: InviteResult }>("createUser", data);
export const updateUser = (uid: string, data: UserInput) => invoke("updateUser", { uid, ...data });
export const setUserDisabled = (uid: string, disabled: boolean) => invoke("setUserDisabled", { uid, disabled });
export const sendUserInvite = (uid: string) => invoke<{ uid: string }, { invite: InviteResult }>("sendUserInvite", { uid });

export const setMyPhoto = (photo: { photo: string; thumb: string }) => invoke<typeof photo, { photo: string }>("setMyPhoto", photo);
export const removeMyPhoto = () => invoke("removeMyPhoto");
export const getMyPhoto = () => invoke<undefined, { dataUrl: string | null }>("getMyPhoto");
