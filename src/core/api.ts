import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { Invitation, ManagedMiniAppId, PortalUser, UserRole } from "./types";

async function invoke<TRequest, TResponse>(name: string, data?: TRequest): Promise<TResponse> {
  return (await httpsCallable<TRequest, TResponse>(functions, name)(data as TRequest)).data;
}

export const getCurrentUser = async () => (await invoke<void, { user: PortalUser }>("getCurrentUser")).user;
export const updateCurrentUser = async (firstName: string, lastName: string) =>
  (await invoke("updateCurrentUser", { firstName, lastName }) as { user: PortalUser }).user;
export const adminListUsers = () => invoke<void, { users: PortalUser[]; invitations: Invitation[] }>("adminListUsers");
export const adminInviteUser = (data: { email: string; firstName: string; lastName: string; role: UserRole; enabledMiniApps: ManagedMiniAppId[] }) =>
  invoke<typeof data, { invitation: Invitation }>("adminInviteUser", data);
export const adminUpdateUserAccess = (data: { uid: string; role: UserRole; status: "active" | "disabled"; enabledMiniApps: ManagedMiniAppId[] }) =>
  invoke<typeof data, { user: PortalUser }>("adminUpdateUserAccess", data);
export const adminResendInvite = (invitationId: string) => invoke("adminResendInvite", { invitationId });
export const adminCancelInvite = (invitationId: string) => invoke("adminCancelInvite", { invitationId });
export const adminUpdateInvite = (data: { invitationId: string; email: string; firstName: string; lastName: string; role: UserRole; enabledMiniApps: ManagedMiniAppId[] }) => invoke<typeof data, { invitation: Invitation }>("adminUpdateInvite", data);
export const previewInvite = (token: string) => invoke<{ token: string }, { invitation: Invitation }>("previewInvite", { token });
export const acceptInvite = (token: string, password: string, firstName: string, lastName: string) =>
  invoke<{ token: string; password: string; firstName: string; lastName: string }, { customToken: string }>("acceptInvite", { token, password, firstName, lastName });
