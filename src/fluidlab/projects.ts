import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";
import { createProject as blankProject, type WellProject } from "./engineering";

export interface AccountProfile { schemaVersion: 1; firstName: string; lastName: string; email: string; status: "active" | "disabled" }
export interface Project { id: string; type: "fluidlab"; schemaVersion: 1; name: string; data?: WellProject; revision: number; createdAt: string; updatedAt: string }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);
export const registerAccount = async (firstName: string, lastName: string) =>
  (await call<{ firstName: string; lastName: string }, { account: AccountProfile }>("registerAccount")({ firstName, lastName })).data.account;
export const getAccount = async () =>
  (await call<void, { account: AccountProfile }>("getAccount")()).data.account;
export const updateAccount = async (firstName: string, lastName: string) =>
  (await call<{ firstName: string; lastName: string }, { account: AccountProfile }>("updateAccountProfile")({ firstName, lastName })).data.account;
export const listProjects = async () =>
  (await call<void, { projects: Project[] }>("listProjects")()).data.projects;
export const createFluidLabProject = async () =>
  (await call<{ type: "fluidlab"; name: string; data: WellProject }, { project: Project }>("createProject")({ type: "fluidlab", name: "Untitled FluidLab Project", data: blankProject() })).data.project;
export const getProject = async (projectId: string) =>
  (await call<{ projectId: string }, { project: Project }>("getProject")({ projectId })).data.project;
export const autosaveProject = async (projectId: string, name: string, data: WellProject, baseRevision: number, mutationId: string) =>
  (await call<{ projectId: string; name: string; data: WellProject; baseRevision: number; mutationId: string }, { project: Project }>("autosaveProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const deleteProject = async (projectId: string) => {
  await call<{ projectId: string }, Record<string, never>>("deleteProject")({ projectId });
};
