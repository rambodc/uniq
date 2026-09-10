/* eslint-disable react-hooks/set-state-in-effect -- Synchronize the external well session and its cached package. */
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../../core/firebase";
import { uploadZip, downloadZip, ensureActive } from "./loading/zip-transfer";
import { inspectPackage, processPackage } from "./pason/package-worker";
import type {
  OperationalDetail,
  WellModel,
  WellPackageManifest,
} from "./pason/well-package";
import type { PasonAttachment } from "./model";
import { call } from "./api";
interface Work {
  controller: AbortController;
  wellId: string;
  id?: string;
  file?: File;
  manifest?: WellPackageManifest;
}
export function usePason(
  wellId: string | undefined,
  attachment: PasonAttachment | undefined,
  refresh: () => Promise<unknown>,
) {
  const [model, setModel] = useState<WellModel | null>(null),
    [view, setView] = useState<"pason" | "estimated">("estimated"),
    [progress, setProgress] = useState<{
      message: string;
      percent: number | null;
    } | null>(null),
    [pending, setPending] = useState<WellPackageManifest | null>(null),
    [error, setError] = useState("");
  const work = useRef<Work | null>(null),
    cache = useRef<string | null>(null),
    selectedView = useRef<"pason" | "estimated">("estimated"),
    initialized = useRef<string | null>(null),
    callback = useRef(refresh);
  useEffect(() => {
    callback.current = refresh;
  }, [refresh]);
  const preference = (id: string) =>
    `fluid-pason:${auth.currentUser?.uid || "anonymous"}:${id}`;
  const current = useCallback(
    (w: Work) => work.current === w && !w.controller.signal.aborted,
    [],
  );
  const cancel = () => {
    const w = work.current;
    work.current = null;
    w?.controller.abort();
    if (w?.id)
      void call("cancelFluidPason", { wellId: w.wellId, uploadId: w.id }).catch(
        () => {},
      );
    setProgress(null);
    setPending(null);
    if (!w?.id && !cache.current) {
      selectedView.current = "estimated";
      setView("estimated");
    }
  };
  useEffect(() => {
    cache.current = null;
    initialized.current = null;
    selectedView.current = "estimated";
    setModel(null);
    setView("estimated");
    setError("");
    setProgress(null);
    setPending(null);
    return () => {
      const w = work.current;
      work.current = null;
      w?.controller.abort();
      if (w?.id)
        void call("cancelFluidPason", {
          wellId: w.wellId,
          uploadId: w.id,
        }).catch(() => {});
    };
  }, [wellId]);
  const select = (v: "pason" | "estimated") => {
    selectedView.current = v;
    setView(v);
    if (wellId)
      try {
        localStorage.setItem(preference(wellId), v);
      } catch {
        /* Storage may be disabled. */
      }
  };
  const fail = useCallback(
    (w: Work, e: unknown) => {
      if (current(w)) {
        setError(
          e instanceof Error
            ? e.message
            : "Pason could not be opened. Retry the attachment.",
        );
        setProgress(null);
        setPending(null);
        if (!cache.current) {
          selectedView.current = "estimated";
          setView("estimated");
        }
        work.current = null;
      }
      if (w.id)
        void call("cancelFluidPason", {
          wellId: w.wellId,
          uploadId: w.id,
        }).catch(() => {});
    },
    [current],
  );
  const open = useCallback(
    async (a: PasonAttachment) => {
      if (!wellId || cache.current === a.id || work.current) return;
      const w: Work = { controller: new AbortController(), wellId };
      work.current = w;
      setError("");
      setProgress({ message: "Opening Pason attachment…", percent: null });
      try {
        const result = await call<{ attachment: PasonAttachment | null }>(
          "getFluidPason",
          { wellId },
        );
        ensureActive(w.controller.signal);
        if (!result.attachment)
          throw new Error("This attachment was removed. Refresh the well.");
        const saved = result.attachment;
        const file = await downloadZip(
          saved.path,
          saved,
          w.controller.signal,
          (percent) => {
            if (current(w))
              setProgress({ message: "Downloading Pason ZIP…", percent });
          },
        );
        setProgress({ message: "Inspecting Pason ZIP…", percent: null });
        const manifest = await inspectPackage(file, w.controller.signal),
          parsed = await processPackage(
            manifest,
            saved.detail,
            w.controller.signal,
            (p) => {
              if (current(w)) setProgress(p);
            },
          );
        if (!current(w)) return;
        cache.current = saved.id;
        setModel(parsed);
        if (selectedView.current === "pason") setView("pason");
        setProgress(null);
        work.current = null;
      } catch (e) {
        fail(w, e);
      }
    },
    [wellId, fail, current],
  );
  useEffect(() => {
    if (!wellId || !attachment || initialized.current === wellId) return;
    initialized.current = wellId;
    let desired = "pason";
    try {
      desired = localStorage.getItem(preference(wellId)) || "pason";
    } catch {
      /* Optional preference. */
    }
    selectedView.current = desired === "estimated" ? "estimated" : "pason";
    setView(selectedView.current);
  }, [wellId, attachment]);
  useEffect(() => {
    if (
      view === "pason" &&
      selectedView.current === "pason" &&
      attachment &&
      !error
    )
      void open(attachment);
  }, [view, attachment, open, error]); // Opening owns its cancellation and session cache.
  useEffect(() => {
    if (!attachment && cache.current && !work.current) {
      cache.current = null;
      selectedView.current = "estimated";
      setModel(null);
      setView("estimated");
    }
  }, [attachment]);
  const save = async (detail: OperationalDetail) => {
    const w = work.current;
    if (!w?.manifest || !w.file) return;
    setPending(null);
    try {
      setProgress({ message: "Processing Pason package…", percent: null });
      const parsed = await processPackage(
        w.manifest,
        detail,
        w.controller.signal,
        (p) => {
          if (current(w)) setProgress(p);
        },
      );
      ensureActive(w.controller.signal);
      w.id = crypto.randomUUID();
      setProgress({ message: "Reserving shared attachment…", percent: null });
      const reserved = await call<{ path: string }>("beginFluidPason", {
        wellId: w.wellId,
        uploadId: w.id,
        originalName: w.file.name,
        sizeBytes: w.file.size,
        detail,
      });
      ensureActive(w.controller.signal);
      await uploadZip(
        reserved.path,
        w.wellId,
        w.file,
        w.controller.signal,
        (percent) => {
          if (current(w))
            setProgress({ message: "Uploading Pason ZIP…", percent });
        },
      );
      ensureActive(w.controller.signal);
      setProgress({ message: "Saving Pason attachment…", percent: null });
      await call("completeFluidPason", {
        wellId: w.wellId,
        uploadId: w.id,
        warnings: parsed.warnings,
      });
      if (!current(w)) return;
      cache.current = w.id;
      w.id = undefined;
      setModel(parsed);
      select("pason");
      await callback.current();
      if (current(w)) {
        setProgress(null);
        work.current = null;
      }
    } catch (e) {
      fail(w, e);
    }
  };
  const upload = async (file: File) => {
    if (!wellId) return;
    cancel();
    setError("");
    if (
      !/\.zip$/i.test(file.name) ||
      file.size < 1 ||
      file.size > 1_000_000_000
    ) {
      setError("Choose a Pason ZIP up to 1 GB.");
      return;
    }
    const w: Work = { controller: new AbortController(), wellId, file };
    work.current = w;
    setProgress({ message: "Inspecting Pason ZIP…", percent: null });
    try {
      w.manifest = await inspectPackage(file, w.controller.signal);
      if (!current(w)) return;
      if (w.manifest.requiresDetailSelection) {
        setPending(w.manifest);
        setProgress(null);
      } else await save("detailed");
    } catch (e) {
      fail(w, e);
    }
  };
  const remove = async () => {
    if (!wellId || !attachment) return;
    cancel();
    setProgress({ message: "Removing Pason attachment…", percent: null });
    try {
      await call("removeFluidPason", { wellId, attachmentId: attachment.id });
      cache.current = null;
      setModel(null);
      select("estimated");
      await callback.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Removal failed. Retry.");
    } finally {
      setProgress(null);
    }
  };
  return {
    model,
    view,
    select,
    progress,
    pending,
    error,
    cancel,
    upload,
    save,
    remove,
    retry: () => {
      setError("");
      if (attachment) {
        selectedView.current = "pason";
        void open(attachment);
      }
    },
  };
}
