import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";

export interface AISource { location: string | null; excerpt: string | null }
export interface AIField<T> { value: T | null; confidence: number; source: AISource }
export interface AIEvidence { confidence:number; source:AISource }
export interface AITrajectory extends AIEvidence { name:string; type:"vertical"|"inclined-hold"|"build"|"drop"|"turn"|"compound"|"horizontal"|"survey"; length:number|null; endInclination:number|null; endAzimuth:number|null; buildRate:number|null; turnRate:number|null }
export interface AIHoleSection extends AIEvidence { name:string; diameter:number|null; underreamedDiameter:number|null; startMd:number|null; endMd:number|null }
export interface AITubular extends AIEvidence { name:string; type:"casing"|"liner"|"tieback"|"tubing"|"other"; topMd:number|null; bottomMd:number|null; nominalSize:number|null; od:number|null; id:number|null; grade:string|null; weight:number|null }
export interface AICement extends AIEvidence { name:string; tubularName:string|null; topMd:number|null; bottomMd:number|null; excessPercent:number|null; material:string|null }
export interface AIWellDraft {
  name:AIField<string>; units:AIField<"metric"|"imperial">; classification:AIField<string>;
  trajectory:AITrajectory[]; holes:AIHoleSection[]; tubulars:AITubular[]; cement:AICement[];
}
export interface AIExtractionResult { assistantMessage: string; draft: AIWellDraft; missingFields: string[]; conflicts: string[]; warnings: string[] }
export interface FluidLabProfile { firstName: string; lastName: string; email: string; status: "active" | "disabled" }
export interface QuotaStatus { analysesRemaining: number; refinementsRemaining: number; resetsAt: string }
export interface ProfileResult { profile: FluidLabProfile; quota: QuotaStatus }
export interface AIResultWithQuota extends AIExtractionResult { quota: QuotaStatus }

const register = httpsCallable<{ firstName: string; lastName: string }, ProfileResult>(functions, "registerFluidLabUser");
const profile = httpsCallable<void, ProfileResult>(functions, "getFluidLabProfile");
const analyze = httpsCallable<{ file: { name: string; mimeType: string; base64: string } }, AIResultWithQuota>(functions, "analyzeWell", { timeout: 120_000 });
const refine = httpsCallable<{ draft: AIWellDraft; message: string }, AIResultWithQuota>(functions, "refineWell", { timeout: 60_000 });

export async function registerProfile(firstName: string, lastName: string) { return (await register({ firstName, lastName })).data; }
export async function getProfile() { return (await profile()).data; }

export async function analyzeWellFile(file: File) {
  const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.readAsDataURL(file); });
  return (await analyze({ file: { name: file.name, mimeType: file.type || inferMime(file.name), base64 } })).data;
}
export async function refineWellDraft(draft: AIWellDraft, message: string) { return (await refine({ draft, message })).data; }
function inferMime(name: string) { const extension = name.split(".").pop()?.toLowerCase(); return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", csv: "text/csv", tsv: "text/tab-separated-values", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Record<string,string>)[extension ?? ""] ?? "application/octet-stream"; }
