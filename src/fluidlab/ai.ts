import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseClient";

export interface AISource { location: string | null; excerpt: string | null }
export interface AIField<T> { value: T | null; confidence: number; source: AISource }
export interface AIHoleSection { name: string; diameter: number | null; startMd: number | null; endMd: number | null; confidence: number; source: AISource }
export interface AIWellDraft {
  name: AIField<string>; type: AIField<"vertical" | "horizontal">; units: AIField<"metric" | "imperial">;
  totalDepth: AIField<number>; kickoffMd: AIField<number>; buildRate: AIField<number>; azimuth: AIField<number>; lateralLength: AIField<number>; sections: AIHoleSection[];
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
