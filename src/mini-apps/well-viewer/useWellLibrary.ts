import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./library";
import { inspectPackage, processPackage } from "./package-worker";
import type { OperationalDetail, WellModel, WellPackageManifest } from "./well-package";

interface Job { controller: AbortController; id?: string; file?: File; manifest?: WellPackageManifest; parsed?: WellModel; uploaded?: boolean; openingId?: string }
export interface LibraryProgress { message: string; percent: number | null }
export function useWellLibrary(onOpen: (well: api.SavedWell, model: WellModel) => void, onDeleted: (id: string) => void) {
  const [wells, setWells] = useState<api.SavedWell[]>([]), [cursor, setCursor] = useState<api.WellCursor | null>(null), [listBusy, setListBusy] = useState(true), [listError, setListError] = useState("");
  const [progress, setProgress] = useState<LibraryProgress | null>(null), [error, setError] = useState(""), [pending, setPending] = useState<WellPackageManifest | null>(null), [busyId, setBusyId] = useState<string | null>(null), [canRetry, setCanRetry] = useState(false);
  const job = useRef<Job | null>(null), mounted = useRef(true), request = useRef(0), retry = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onOpen, onDeleted }); useEffect(() => { callbacks.current = { onOpen, onDeleted }; }, [onOpen, onDeleted]);
  const current = (work: Job) => mounted.current && job.current === work && !work.controller.signal.aborted;
  const cancel = useCallback(() => {
    const work = job.current; job.current = null; work?.controller.abort();
    if (work?.id) void api.deleteWell(work.id).catch(() => {});
    retry.current = null;
    if (mounted.current) { setProgress(null); setPending(null); setCanRetry(false); setError(""); }
  }, []);
  const load = useCallback(async (after: api.WellCursor | null = null) => {
    const token = ++request.current; setListBusy(true); setListError("");
    try { const result = await api.listWells(after); if (!mounted.current || token !== request.current) return; setWells((old) => after ? [...old, ...result.wells.filter((item) => !old.some((known) => known.id === item.id))] : result.wells); setCursor(result.cursor); }
    catch { if (mounted.current && token === request.current) setListError("Your wells could not be loaded. Retry when your connection is available."); }
    finally { if (mounted.current && token === request.current) setListBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; let live = true; void Promise.resolve().then(() => { if (live) void load(); }); return () => { live = false; mounted.current = false; cancel(); }; }, [load, cancel]);
  const failure = (work: Job, cause: unknown, again: () => void) => {
    if (!current(work)) return;
    setProgress(null); setError(cause instanceof Error ? cause.message : "The operation failed. Please retry."); retry.current = again; setCanRetry(true);
  };
  const save = async (work: Job, detail: OperationalDetail) => {
    const signal = work.controller.signal;
    if (!current(work)) return;
    setPending(null); setError(""); setCanRetry(false);
    try {
      if (!work.parsed) { setProgress({ message: "Processing well package…", percent: 0 }); work.parsed = await processPackage(work.manifest!, detail, signal, (value) => { if (current(work)) setProgress(value); }); }
      api.ensureActive(signal);
      if (!work.uploaded) {
        setProgress({ message: "Preparing private upload…", percent: null });
        work.id ??= crypto.randomUUID();
        const reservation = await api.beginUpload(work.id, (work.parsed.name || work.file!.name.replace(/\.zip$/i, "")).slice(0, 120), work.file!, detail);
        api.ensureActive(signal);
        try { await api.uploadZip(reservation.path, work.id, work.file!, signal, (percent) => { if (current(work)) setProgress({ message: "Uploading original ZIP…", percent }); }); }
        catch (cause) { api.ensureActive(signal); try { await api.completeUpload(work.id); } catch { throw cause; } }
        work.uploaded = true;
      }
      api.ensureActive(signal); setProgress({ message: "Saving your well…", percent: null });
      const { well } = await api.completeUpload(work.id!);
      if (!current(work)) { await api.deleteWell(well.id); return; }
      work.id = undefined; job.current = null; retry.current = null; setCanRetry(false); setProgress(null);
      setWells((old) => [well, ...old.filter((item) => item.id !== well.id)]); callbacks.current.onOpen(well, work.parsed); void load();
    } catch (cause) { if (signal.aborted && work.id) void api.deleteWell(work.id).catch(() => {}); failure(work, cause, () => { void save(work, detail); }); }
  };
  const prepare = async (work: Job) => {
    try {
      setProgress({ message: "Inspecting well ZIP…", percent: null });
      work.manifest = await inspectPackage(work.file!, work.controller.signal);
      if (!current(work)) return;
      if (work.manifest.requiresDetailSelection) { setProgress(null); setPending(work.manifest); }
      else await save(work, "detailed");
    } catch (cause) { failure(work, cause, () => { void prepare(work); }); }
  };
  const upload = (file: File) => {
    cancel();
    if (!/\.zip$/i.test(file.name) || file.size < 1 || file.size > 1_000_000_000) { setError("Choose an original well ZIP up to 1 GB."); return; }
    const work: Job = { controller: new AbortController(), file }; job.current = work; void prepare(work);
  };
  const open = (id: string) => {
    cancel(); const work: Job = { controller: new AbortController(), openingId: id }; job.current = work;
    const run = async () => {
      try {
        setError(""); setCanRetry(false); setProgress({ message: "Opening saved well…", percent: null });
        const { well, path } = await api.getWell(id); api.ensureActive(work.controller.signal);
        const file = await api.downloadZip(path, well, work.controller.signal, (percent) => { if (current(work)) setProgress({ message: "Downloading original ZIP…", percent }); });
        if (!current(work)) return;
        setProgress({ message: "Inspecting saved ZIP…", percent: null });
        const manifest = await inspectPackage(file, work.controller.signal), parsed = await processPackage(manifest, well.detail, work.controller.signal, (value) => { if (current(work)) setProgress(value); });
        if (!current(work)) return;
        job.current = null; retry.current = null; setProgress(null); setCanRetry(false); callbacks.current.onOpen(well, parsed);
      } catch (cause) { failure(work, cause, () => { void run(); }); }
    };
    void run();
  };
  const rename = async (id: string, name: string) => {
    setBusyId(id);
    try { const { well } = await api.renameWell(id, name); if (mounted.current) setWells((old) => old.map((item) => item.id === id ? well : item)); return true; }
    catch { if (mounted.current) setError("The well could not be renamed. Try again."); return false; }
    finally { if (mounted.current) setBusyId(null); }
  };
  const remove = async (id: string) => {
    if (job.current?.openingId === id) cancel();
    setBusyId(id);
    try { await api.deleteWell(id); if (mounted.current) { setWells((old) => old.filter((item) => item.id !== id)); callbacks.current.onDeleted(id); } return true; }
    catch { if (mounted.current) setError("Deletion could not finish. Retry Delete to remove the well."); return false; }
    finally { if (mounted.current) setBusyId(null); }
  };
  return { wells, listBusy, listError, hasMore: Boolean(cursor), progress, error, pending, busyId, canRetry, upload, open, rename, remove, cancel,
    refresh: () => { void load(); }, more: () => { if (!listBusy && cursor) void load(cursor); },
    confirmDetail: (detail: OperationalDetail) => { if (job.current) void save(job.current, detail); },
    retry: () => { setError(""); setCanRetry(false); retry.current?.(); }, dismissError: () => setError("") };
}
