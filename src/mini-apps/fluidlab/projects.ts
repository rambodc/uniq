import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";
import type { WellProject } from "./engineering";
import { createProject as blankProject } from "./engineering";

export interface ChatMessage { id: string; role: "user" | "assistant"; text: string; createdAt: string }
export interface FluidProgramsData { version: 1; messages: ChatMessage[] }
export type ProjectType = "fluidlab" | "fluid-programs";
export interface Project { id: string; type: ProjectType; schemaVersion: 1; name: string; data?: WellProject | FluidProgramsData; revision: number; createdAt: string; updatedAt: string; remaining?: number }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);

export const listProjects = async (type: ProjectType = "fluidlab") => (await call<void, { projects: Project[] }>(type === "fluidlab" ? "listFluidLabProjects" : "listFluidProgramsProjects")()).data.projects;
export const createFluidLabProject = async (name: string) => (await call<{ name: string; data: WellProject }, { project: Project }>("createFluidLabProject")({ name, data: { ...blankProject(), name } })).data.project;
export const createFluidProgramsProject = async (name: string) => (await call<{ name: string }, { project: Project }>("createFluidProgramsProject")({ name })).data.project;
export const getProject = async (projectId: string, type?: ProjectType) => { const inferred = type || (location.pathname.includes("fluid-programs") ? "fluid-programs" : "fluidlab"); return (await call<{ projectId: string }, { project: Project; remaining?: number }>(inferred === "fluidlab" ? "getFluidLabProject" : "getFluidProgramsProject")({ projectId })).data; };
export const autosaveProject = async (projectId: string, name: string, data: WellProject, baseRevision: number, mutationId: string) => (await call<unknown, { project: Project }>("saveFluidLabProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const renameFluidProgramsProject = async (projectId: string, name: string, data: FluidProgramsData, baseRevision: number, mutationId: string) => (await call<unknown, { project: Project }>("saveFluidProgramsProject")({ projectId, name, data, baseRevision, mutationId })).data.project;
export const sendFluidProgramsMessage = async (projectId: string, text: string, baseRevision: number, mutationId: string) => (await call<unknown, { project: Project; remaining: number }>("sendFluidProgramsMessage")({ projectId, text, baseRevision, mutationId })).data;
export const deleteProject = async (projectId: string, type?: ProjectType) => { const inferred = type || (location.pathname.includes("fluid-programs") ? "fluid-programs" : "fluidlab"); await call<{ projectId: string }, void>(inferred === "fluidlab" ? "deleteFluidLabProject" : "deleteFluidProgramsProject")({ projectId }); };
