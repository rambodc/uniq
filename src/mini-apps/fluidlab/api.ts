import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { functions, wellStorage } from "../../core/firebase";
import type {
  Dataset,
  Well,
  ImportJob,
  Source,
  Version,
  ChatMessage,
  Branch,
  Wellbore,
} from "./model";
const call = async <R>(name: string, data: unknown = {}) =>
  (await httpsCallable<unknown, R>(functions, name, { timeout: 330000 })(data))
    .data;
export const listWells = async () =>
  (await call<{ wells: Well[] }>("listFluidWells")).wells;
export const createWell = async (name: string, autoName = false) =>
  (
    await call<{ well: Well }>("createFluidWell", {
      name,
      autoName,
      mutationId: crypto.randomUUID(),
    })
  ).well;
export const renameWell = (well: Well, name: string) =>
  call("renameFluidWell", {
    wellId: well.id,
    name,
    baseRevision: well.revision,
    mutationId: crypto.randomUUID(),
  });
export const deleteWell = (wellId: string) =>
  call("deleteFluidWell", { wellId, mutationId: crypto.randomUUID() });
export async function getWell(wellId: string) {
  const first = await call<Dataset & { next: number | null }>("getFluidWell", {
    wellId,
  });
  let next = first.next;
  while (next !== null) {
    const page = await call<{
      records: Dataset["records"];
      next: number | null;
    }>("getFluidWell", { wellId, version: first.well.version, offset: next });
    first.records.push(...page.records);
    next = page.next;
  }
  return first;
}
export const getSources = (
  wellId: string,
  version: string | null,
  ids?: string[],
  query?: string,
  offset = 0,
) =>
  call<{ sources: Source[]; total: number; next: number | null }>(
    "getFluidSources",
    {
      wellId,
      version,
      ...(ids ? { ids } : {}),
      ...(query ? { query } : {}),
      offset,
    },
  );
export const getHistory = (wellId: string) =>
  call<{ versions: Version[]; imports: ImportJob[] }>("getFluidHistory", {
    wellId,
  });
export const getImport = async (importId: string) =>
  (await call<{ job: ImportJob }>("getFluidImport", { importId })).job;
export const retryImport = (importId: string) =>
  call("retryFluidImport", { importId });
export async function uploadFiles(
  wellId: string,
  files: File[],
  onProgress: (percent: number) => void,
  onReserved?: (job: ImportJob) => void,
) {
  if (!files.length || files.length > 5)
    throw new Error("Choose 1–5 spreadsheets.");
  if (
    files.some(
      (f) =>
        !/\.(xlsx|xls|csv|tsv)$/i.test(f.name) || f.size > 20 * 1024 * 1024,
    ) ||
    files.reduce((s, f) => s + f.size, 0) > 50 * 1024 * 1024
  )
    throw new Error(
      "Use XLSX, XLS, CSV or TSV, up to 20 MB each / 50 MB combined.",
    );
  const info = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      size: f.size,
      sha256: [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", await f.arrayBuffer()),
        ),
      ]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    })),
  );
  const { job } = await call<{ job: ImportJob }>("beginFluidImport", {
    wellId,
    files: info,
    mutationId: crypto.randomUUID(),
  });
  onReserved?.(job);
  for (let i = 0; i < files.length; i++) {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(
        ref(wellStorage, job.files[i].path),
        files[i],
        {
          contentType: "application/octet-stream",
          customMetadata: { importId: job.id, wellId },
        },
      );
      task.on(
        "state_changed",
        (snap) =>
          onProgress(
            Math.round(
              (100 * (i + snap.bytesTransferred / snap.totalBytes)) /
                files.length,
            ),
          ),
        reject,
        () => resolve(),
      );
    });
  }
  await call("completeFluidImport", { importId: job.id });
  return job;
}
export const completeImport = (importId: string) =>
  call("completeFluidImport", { importId });
export const saveWell = (
  well: Well,
  change: {
    geometry?: Branch[];
    wellbore?: Wellbore;
    currency?: string | null;
    correction?: { recordId: string; field: string; value: string };
  },
) =>
  call<{ version: string; revision: number }>("saveFluidWell", {
    wellId: well.id,
    baseRevision: well.revision,
    mutationId: crypto.randomUUID(),
    ...change,
  });
export const restoreVersion = (well: Well, version: string) =>
  call("restoreFluidVersion", {
    wellId: well.id,
    baseRevision: well.revision,
    version,
    mutationId: crypto.randomUUID(),
  });
export const getChat = async (wellId: string) =>
  (await call<{ messages: ChatMessage[] }>("getFluidChat", { wellId }))
    .messages;
export const askChat = async (well: Well, question: string) =>
  (
    await call<{ message: ChatMessage }>("askFluidChat", {
      wellId: well.id,
      version: well.version,
      question,
      mutationId: crypto.randomUUID(),
    })
  ).message;

export const cancelImport = (importId: string) =>
  call("cancelFluidImport", { importId });
