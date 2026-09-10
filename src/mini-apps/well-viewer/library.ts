import { httpsCallable } from "firebase/functions";
import { functions } from "../../core/firebase";
import type { OperationalDetail } from "./well-package";
export interface SavedWell { id: string; name: string; originalName: string; sizeBytes: number; detail: OperationalDetail; createdAt: string; updatedAt: string; generation: string }
export interface WellCursor { id: string; seconds: number; nanoseconds: number }
const invoke = async <T>(name: string, data: object = {}) => (await httpsCallable<object, T>(functions, name)(data)).data;
export const listWells = (cursor: WellCursor | null = null) => invoke<{ wells: SavedWell[]; cursor: WellCursor | null }>("listSavedWells", { cursor });
export const beginUpload = (uploadId: string, name: string, file: File, detail: OperationalDetail) => invoke<{ wellId: string; path: string }>("beginWellUpload", { uploadId, name, originalName: file.name, sizeBytes: file.size, detail });
export const completeUpload = (wellId: string) => invoke<{ well: SavedWell }>("completeWellUpload", { wellId });
export const getWell = (wellId: string) => invoke<{ well: SavedWell; path: string }>("getSavedWell", { wellId });
export const renameWell = (wellId: string, name: string) => invoke<{ well: SavedWell }>("renameSavedWell", { wellId, name });
export const deleteWell = (wellId: string) => invoke("deleteSavedWell", { wellId });
export {cancelled,ensureActive,uploadZip,downloadZip} from "../../components/well/zip-transfer";
