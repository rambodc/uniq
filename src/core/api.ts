import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { ContactInquiry, ContactInquiryCounts, ContactInquiryType, ManagedMiniAppId, PortalUser, UserRole } from "./types";

async function invoke<TRequest, TResponse>(name: string, data?: TRequest): Promise<TResponse> {
  return (await httpsCallable<TRequest, TResponse>(functions, name)(data as TRequest)).data;
}

export const getCurrentUser = async () => (await invoke<void, { user: PortalUser }>("getCurrentUser")).user;
export const updateCurrentUser = async (firstName: string, lastName: string) =>
  (await invoke("updateCurrentUser", { firstName, lastName }) as { user: PortalUser }).user;
export const requestLoginCode = (email: string) => invoke<{ email: string }, { challengeId: string }>("requestLoginCode", { email });
export const verifyLoginCode = (challengeId: string, code: string) => invoke<{ challengeId: string; code: string }, { customToken: string }>("verifyLoginCode", { challengeId, code });
export const revokeMySessions = () => invoke("revokeMySessions");
export const adminListUsers = (data: { query?: string; cursor?: string } = {}) => invoke<typeof data, { users: PortalUser[]; cursor: string | null }>("adminListUsers", data);
export const adminUpdateUserAccess = (data: { uid: string; role: UserRole; status: "active" | "disabled"; enabledMiniApps: ManagedMiniAppId[] }) => invoke<typeof data, { user: PortalUser }>("adminUpdateUserAccess", data);
export interface ContactInquiryListRequest { archiveState: "active" | "archived"; inquiryType: ContactInquiryType | "all"; query: string; cursor?: number; pageSize?: number }
export interface ContactInquiryListResponse { inquiries: ContactInquiry[]; counts: ContactInquiryCounts; nextCursor: number | null; total: number; limited: boolean }
export const listContactInquiries = (data: ContactInquiryListRequest) => invoke<ContactInquiryListRequest, ContactInquiryListResponse>("listContactInquiries", data);
export const archiveContactInquiry = (inquiryId: string) => invoke<{ inquiryId: string }, { inquiry: ContactInquiry }>("archiveContactInquiry", { inquiryId });
export const restoreContactInquiry = (inquiryId: string) => invoke<{ inquiryId: string }, { inquiry: ContactInquiry }>("restoreContactInquiry", { inquiryId });
