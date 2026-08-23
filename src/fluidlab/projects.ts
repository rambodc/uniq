import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";
import type { WellDesign } from "./model";

export interface Project { id: string; name: string; design?: WellDesign; revision: number; archivedAt: string | null; createdAt: string; updatedAt: string }
export interface ProjectVersion { id: string; name: string; note: string; design: WellDesign; createdAt: string }
const call = <T, R>(name: string) => httpsCallable<T, R>(functions, name);
export const listProjects = async (archived = false) => (await call<{archived:boolean},{projects:Project[]}>("listFluidLabProjects")({archived})).data.projects;
export const getProject = async (projectId: string) => (await call<{projectId:string},{project:Project;versions:ProjectVersion[]}>("getFluidLabProject")({projectId})).data;
export const createProject = async (design: WellDesign) => (await call<{design:WellDesign},{project:Project}>("createFluidLabProject")({design})).data.project;
export const updateProject = async (projectId: string, design: WellDesign, revision: number) => (await call<{projectId:string;design:WellDesign;revision:number},{project:Project}>("updateFluidLabProject")({projectId,design,revision})).data.project;
export const projectAction = async (action: "duplicate"|"archive"|"restore"|"delete", projectId: string) => (await call<{action:string;projectId:string},{project?:Project}>("manageFluidLabProject")({action,projectId})).data;
export const createVersion = async (projectId:string, name:string, note:string) => (await call<{projectId:string;name:string;note:string},{version:ProjectVersion}>("createFluidLabVersion")({projectId,name,note})).data.version;
export const versionAction = async (action:"restore"|"delete",projectId:string,versionId:string,revision:number) => (await call<{action:string;projectId:string;versionId:string;revision:number},{project?:Project}>("manageFluidLabVersion")({action,projectId,versionId,revision})).data;
