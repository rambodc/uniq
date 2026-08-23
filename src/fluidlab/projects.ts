import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";
import type { WellProject } from "./engineering";

export interface Project { id: string; name: string; design?: WellProject; revision: number; archivedAt: string | null; createdAt: string; updatedAt: string }
export interface ProjectVersion { id: string; name: string; note: string; design: WellProject; createdAt: string }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);
export const listProjects = async (archived = false) => (await call<{archived:boolean},{projects:Project[]}>("listFluidLabProjects")({archived})).data.projects;
export const getProject = async (projectId: string) => (await call<{projectId:string},{project:Project;versions:ProjectVersion[]}>("getFluidLabProject")({projectId})).data;
export const createProject = async (design: WellProject) => (await call<{design:WellProject},{project:Project}>("createFluidLabProject")({design})).data.project;
export const updateProject = async (projectId: string, design: WellProject, baseRevision: number, mutationId:string) => (await call<{projectId:string;design:WellProject;baseRevision:number;mutationId:string},{project:Project}>("updateFluidLabProject")({projectId,design,baseRevision,mutationId})).data.project;
export const projectAction = async (action: "duplicate"|"duplicate-converted"|"archive"|"restore"|"delete", projectId: string) => (await call<{action:string;projectId:string},{project?:Project}>("manageFluidLabProject")({action,projectId})).data;
export const createVersion = async (projectId:string, name:string, note:string) => (await call<{projectId:string;name:string;note:string},{version:ProjectVersion}>("createFluidLabVersion")({projectId,name,note})).data.version;
export const versionAction = async (action:"restore"|"delete",projectId:string,versionId:string,revision:number) => (await call<{action:string;projectId:string;versionId:string;revision:number},{project?:Project}>("manageFluidLabVersion")({action,projectId,versionId,revision})).data;
