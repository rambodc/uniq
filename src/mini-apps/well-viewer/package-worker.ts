import type { OperationalDetail, WellImportProgress, WellModel, WellPackageManifest } from "./well-package";
function run<T>(message: object, signal: AbortSignal, progress?: (value: WellImportProgress) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const worker = new Worker(new URL("./package.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { worker.terminate(); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { if (data.progress) { progress?.(data.progress); return; } cleanup(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
    worker.onerror = () => { cleanup(); reject(new Error("Well processing stopped. Try uploading the ZIP again.")); };
    worker.postMessage(message);
  });
}
export const inspectPackage = (file: File, signal: AbortSignal) => run<WellPackageManifest>({ kind: "inspect", file }, signal);
export const processPackage = (manifest: WellPackageManifest, detail: OperationalDetail, signal: AbortSignal, progress: (value: WellImportProgress) => void) => run<WellModel>({ kind: "parse", manifest, detail }, signal, progress);
