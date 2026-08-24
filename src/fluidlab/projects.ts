import {httpsCallable} from "firebase/functions";
import {functions} from "../firebaseClient";
import type {WellProject} from "./engineering";
export interface Project{id:string;name:string;design?:WellProject;revision:number;createdAt:string;updatedAt:string}
export interface FluidLabProfile{firstName:string;lastName:string;email:string;status:"active"|"disabled"}
const call=<T,R>(name:string)=>httpsCallable<T,R>(functions,name);
export const registerProfile=async(firstName:string,lastName:string)=>(await call<{firstName:string;lastName:string},{profile:FluidLabProfile}>("registerFluidLabUser")({firstName,lastName})).data;
export const getProfile=async()=>(await call<void,{profile:FluidLabProfile}>("getFluidLabProfile")()).data;
export const listProjects=async()=>(await call<void,{projects:Project[]}>("listFluidLabProjects")()).data.projects;
export const getProject=async(projectId:string)=>(await call<{projectId:string},{project:Project}>("getFluidLabProject")({projectId})).data.project;
export const createProject=async(design:WellProject)=>(await call<{design:WellProject},{project:Project}>("createFluidLabProject")({design})).data.project;
export const updateProject=async(projectId:string,design:WellProject,baseRevision:number,mutationId:string)=>(await call<{projectId:string;design:WellProject;baseRevision:number;mutationId:string},{project:Project}>("updateFluidLabProject")({projectId,design,baseRevision,mutationId})).data.project;
export const deleteProject=async(projectId:string)=>{await call<{projectId:string},Record<string,never>>("deleteFluidLabProject")({projectId})};
