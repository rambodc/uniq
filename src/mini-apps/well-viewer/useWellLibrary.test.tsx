// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./library";
import * as parser from "./package-worker";
import { useWellLibrary } from "./useWellLibrary";
import type { WellModel, WellPackageManifest } from "./well-package";
vi.mock("./library", () => ({ listWells: vi.fn(), getWell: vi.fn(), beginUpload: vi.fn(), completeUpload: vi.fn(), uploadZip: vi.fn(), downloadZip: vi.fn(), renameWell: vi.fn(), deleteWell: vi.fn(), ensureActive: (signal: AbortSignal) => { if (signal.aborted) throw new DOMException("Cancelled", "AbortError"); } }));
vi.mock("./package-worker", () => ({ inspectPackage: vi.fn(), processPackage: vi.fn() }));
const well: api.SavedWell = { id: "well-1", name: "Original", originalName: "original.zip", sizeBytes: 3, detail: "balanced", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", generation: "1" };
const file = new File(["zip"], "original.zip"), manifest: WellPackageManifest = { file, requiresDetailSelection: false, entries: [], packageName: file.name, surveyFileName: "surveys_1.txt", etsFileName: "ETS.xml", csvFileName: "drilling.csv", csvSizeBytes: 3 }, model = { name: "Original" } as WellModel;
let root: Root, state: ReturnType<typeof useWellLibrary>, container: HTMLDivElement;
const onOpen = vi.fn(), onDeleted = vi.fn();
function Harness() { const library = useWellLibrary(onOpen, onDeleted); useEffect(() => { state = library; }); return null; }
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks();
  vi.mocked(api.listWells).mockResolvedValue({ wells: [well], cursor: null }); vi.mocked(api.getWell).mockResolvedValue({ well, path: "private/path" });
  vi.mocked(api.beginUpload).mockResolvedValue({ wellId: "new", path: "private/new" }); vi.mocked(api.completeUpload).mockResolvedValue({ well: { ...well, id: "new" } });
  vi.mocked(api.downloadZip).mockResolvedValue(file); vi.mocked(api.uploadZip).mockResolvedValue(); vi.mocked(api.deleteWell).mockResolvedValue({});
  vi.mocked(parser.inspectPackage).mockResolvedValue(manifest); vi.mocked(parser.processPackage).mockResolvedValue(model);
  container = document.createElement("div"); root = createRoot(container); await act(async () => root.render(<Harness/>)); await flush();
});
afterEach(async () => { await act(async () => root.unmount()); });
describe("private well library lifecycle", () => {
  it("loads metadata without downloading a well", () => { expect(state.wells).toEqual([well]); expect(api.downloadZip).not.toHaveBeenCalled(); });
  it("opens a saved ZIP only after downloading and processing", async () => {
    await act(async () => state.open(well.id)); await flush();
    expect(parser.processPackage).toHaveBeenCalledWith(manifest, "balanced", expect.any(AbortSignal), expect.any(Function)); expect(onOpen).toHaveBeenCalledWith(well, model);
  });
  it("ignores stale openings when switching wells", async () => {
    const slow = deferred<{ well: api.SavedWell; path: string }>(); vi.mocked(api.getWell).mockReturnValueOnce(slow.promise);
    await act(async () => state.open("slow")); await act(async () => state.open("well-1")); await flush();
    await act(async () => slow.resolve({ well: { ...well, id: "slow" }, path: "slow" })); await flush();
    expect(onOpen).toHaveBeenCalledTimes(1); expect(onOpen.mock.calls[0][0].id).toBe("well-1");
  });
  it("preserves the current scene on failure and supports retry", async () => {
    vi.mocked(api.downloadZip).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => state.open(well.id)); await flush(); expect(onOpen).not.toHaveBeenCalled(); expect(state.canRetry).toBe(true);
    await act(async () => state.retry()); await flush(); expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it("processes before upload and retries completion without uploading twice", async () => {
    vi.mocked(api.completeUpload).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => state.upload(file)); await flush();
    expect(api.beginUpload).toHaveBeenCalled(); expect(vi.mocked(parser.processPackage).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.uploadZip).mock.invocationCallOrder[0]);
    expect(state.canRetry).toBe(true); expect(onOpen).not.toHaveBeenCalled();
    await act(async () => state.retry()); await flush(); expect(api.uploadZip).toHaveBeenCalledTimes(1); expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it("does not upload when detail selection is cancelled", async () => {
    vi.mocked(parser.inspectPackage).mockResolvedValue({ ...manifest, requiresDetailSelection: true });
    await act(async () => state.upload(file)); await flush(); expect(state.pending).not.toBeNull();
    await act(async () => state.cancel()); expect(api.beginUpload).not.toHaveBeenCalled(); expect(onOpen).not.toHaveBeenCalled();
  });
  it("cleans a reservation when leaving during an upload", async () => {
    const slow = deferred<void>(); vi.mocked(api.uploadZip).mockReturnValue(slow.promise);
    await act(async () => state.upload(file)); await flush(); await act(async () => state.cancel());
    expect(api.deleteWell).toHaveBeenCalled(); await act(async () => slow.resolve()); await flush(); expect(onOpen).not.toHaveBeenCalled();
  });
  it("keeps failed deletions retryable and only clears after success", async () => {
    vi.mocked(api.deleteWell).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { await state.remove(well.id); }); expect(state.wells).toHaveLength(1); expect(onDeleted).not.toHaveBeenCalled();
    await act(async () => { await state.remove(well.id); }); expect(state.wells).toHaveLength(0); expect(onDeleted).toHaveBeenCalledWith(well.id);
  });
});
