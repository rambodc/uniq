import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";
import { createProject as blankProject, type WellProject } from "./engineering";

export interface AccountProfile { schemaVersion: 1; firstName: string; lastName: string; email: string; status: "active" | "disabled" }
export interface ChatMessage { id: string; role: "user" | "assistant"; text: string; createdAt: string }
export interface FluidProgramsData { version: 1; messages: ChatMessage[] }
export type ProjectType = "fluidlab" | "fluid-programs";
export interface Project { id: string; type: ProjectType; schemaVersion: 1; name: string; data?: WellProject | FluidProgramsData; revision: number; createdAt: string; updatedAt: string; remaining?: number }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);
export const registerAccount = async (firstName: string, lastName: string) =>
  (await call<{ firstName: string; lastName: string }, { account: AccountProfile }>("registerAccount")({ firstName, lastName })).data.account;
export const getAccount = async () =>
  (await call<void, { account: AccountProfile }>("getAccount")()).data.account;
export const updateAccount = async (firstName: string, lastName: string) =>
  (await call<{ firstName: string; lastName: string }, { account: AccountProfile }>("updateAccountProfile")({ firstName, lastName })).data.account;
export const listProjects = async () =>
  (await call<void, { projects: Project[] }>("listProjects")()).data.projects;
export const createFluidLabProject = async (name: string) =>
  (await call<{ type: "fluidlab"; name: string; data: WellProject }, { project: Project }>("createProject")({ type: "fluidlab", name, data: { ...blankProject(), name } })).data.project;
export const createFluidProgramsProject = async (name: string) =>
  (await call<{ type: "fluid-programs"; name: string; data: FluidProgramsData }, { project: Project }>("createProject")({ type: "fluid-programs", name, data: { version: 1, messages: [] } })).data.project;
export const getProject = async (projectId: string) =>
  (await call<{ projectId: string }, { project: Project; remaining?: number }>("getProject")({ projectId })).data;
export const autosaveProject = async (projectId: string, name: string, data: WellProject, baseRevision: number, mutationId: string) =>
  (await call<{ projectId: string; name: string; data: WellProject; baseRevision: number; mutationId: string }, { project: Project }>("autosaveProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const renameFluidProgramsProject = async (projectId: string, name: string, data: FluidProgramsData, baseRevision: number, mutationId: string) =>
  (await call<{ projectId: string; name: string; data: FluidProgramsData; baseRevision: number; mutationId: string }, { project: Project }>("autosaveProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const sendFluidProgramsMessage = async (projectId: string, text: string, baseRevision: number, mutationId: string) =>
  (await call<{ projectId: string; text: string; baseRevision: number; mutationId: string }, { project: Project; remaining: number }>("sendFluidProgramsMessage")({ projectId, text, baseRevision, mutationId })).data;
export const deleteProject = async (projectId: string) => {
  await call<{ projectId: string }, Record<string, never>>("deleteProject")({ projectId });
};
