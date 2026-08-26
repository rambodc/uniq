import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";
import type { WellProject } from "./engineering";
import { createProject as blankProject } from "./engineering";

export interface Project { id: string; type: "fluidlab"; schemaVersion: 1; name: string; data?: WellProject; revision: number; createdAt: string; updatedAt: string }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);

export const listProjects = async () => (await call<void, { projects: Project[] }>("listFluidLabProjects")()).data.projects;
export const createFluidLabProject = async (name: string) => (await call<{ name: string; data: WellProject }, { project: Project }>("createFluidLabProject")({ name, data: { ...blankProject(), name } })).data.project;
export const getProject = async (projectId: string) => (await call<{ projectId: string }, { project: Project }>("getFluidLabProject")({ projectId })).data;
export const autosaveProject = async (projectId: string, name: string, data: WellProject, baseRevision: number, mutationId: string) => (await call<unknown, { project: Project }>("saveFluidLabProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const deleteProject = async (projectId: string) => { await call<{ projectId: string }, void>("deleteFluidLabProject")({ projectId }); };
