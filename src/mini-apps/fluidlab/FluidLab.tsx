import LoadingOverlay from "../../components/well/LoadingOverlay";
import PackageDetailDialog from "../../components/well/PackageDetailDialog";
import { useWellSearch } from "./useWellSearch";
import { usePason } from "./usePason";
import {
  SurveyScene,
  SurveyDetails,
  SurveyControls,
  useSurveyNavigation,
} from "../well-viewer/SurveyWorkspace";
import "../well-viewer/well-viewer.css";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  ChevronRight,
  Plus,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import * as api from "./api";
import { Costs, Mud, Chat, Facts, ProductDetail, ReportDetail } from "./Panels";
import Review from "./Review";
import {
  type DataRecord,
  type Dataset,
  type ImportJob,
  type Source,
  type WellChange,
} from "./model";
import "./fluidlab.css";
function PreparingScene({
  onChange,
}: {
  onChange: (loading: boolean) => void;
}) {
  useEffect(() => {
    onChange(true);
    return () => onChange(false);
  }, [onChange]);
  return null;
}
const WellScene = lazy(() => import("./WellScene"));
const active = (job: ImportJob | null) =>
  !!job && ["uploading", "queued", "processing"].includes(job.status);
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
type Detail =
  | { kind: "record"; record: DataRecord }
  | { kind: "sources"; sources: Source[] }
  | { kind: "pason" };
const tabs = [
  ["wells", "Wells"],
  ["costs", "Costs"],
  ["mud", "Mud"],
  ["review", "Review"],
  ["chat", "Chat"],
];
export default function FluidLab({
  wellId,
  navigate,
}: {
  wellId?: string;
  navigate: (url: string) => void;
}) {
  const [data, setData] = useState<Dataset | null>(null),
    [tab, setTab] = useState("wells"),
    [report, setReport] = useState<string | null>(null),
    [error, setError] = useState(""),
    [pollError, setPollError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [percent, setPercent] = useState(0),
    [history, setHistory] = useState<ImportJob[]>([]),
    [job, setJob] = useState<ImportJob | null>(null),
    [details, setDetails] = useState<Detail[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [collapsed, setCollapsed] = useState(false),
    [sidebarWidth, setSidebarWidth] = useState(560),
    [view, setView] = useState("isometric"),
    [fit, setFit] = useState(0),
    [capture, setCapture] = useState(0),
    [highlights, setHighlights] = useState<string[]>([]),
    [name, setName] = useState(""),
    [editingName, setEditingName] = useState(false),
    [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    currentWell = useRef(wellId),
    uploadController = useRef<AbortController | null>(null),
    uploadTarget = useRef<string | null>(null),
    detailTrigger = useRef<HTMLElement | null>(null);
  const library = useWellSearch();
  const { wells, refresh: list } = library;
  const zipFile = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    if (!wellId) return;
    const [d, h] = await Promise.all([
      api.getWell(wellId),
      api.getHistory(wellId),
    ]);
    if (currentWell.current !== wellId) return;
    setData(d);
    setHistory(h.imports);
    setJob(h.imports.find(active) || h.imports[0] || null);
    return d;
  }, [wellId]);
  const pason = usePason(
    wellId,
    data && data.well.id === wellId ? data.well.pason : undefined,
    refresh,
  );
  const survey = useSurveyNavigation(
    pason.model,
    pason.view === "pason" && !pason.progress && !busy && !loading,
  );
  const [sceneLoading, setSceneLoading] = useState(false);
  const processing = !!job && ["queued", "processing"].includes(job.status);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    currentWell.current = wellId;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setData(null);
      setReport(null);
      setJob(null);
      setTab(uploadTarget.current === wellId ? "review" : "wells");
      setHistory([]);
      setDetails([]);
      setSelected(null);
      setHighlights([]);
      setError("");
      setPollError("");
      setEditingName(false);
      setDeleting(false);
      setLoading(!!wellId);
      if (wellId)
        void Promise.all([api.getWell(wellId), api.getHistory(wellId)])
          .then(([d, h]) => {
            if (alive) {
              setData(d);
              setHistory(h.imports);
              setJob(h.imports.find(active) || h.imports[0] || null);
            }
          })
          .catch((e) => {
            if (alive) setError(message(e));
          })
          .finally(() => {
            if (alive) setLoading(false);
          });
    });
    return () => {
      alive = false;
    };
  }, [wellId]);
  const jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    if (
      !jobId ||
      !["queued", "processing", "uploading"].includes(jobStatus || "")
    )
      return;
    let alive = true,
      pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void api
        .getImport(jobId)
        .then(async (next) => {
          if (!alive) return;
          setPollError("");
          if (!active(next)) {
            await refresh();
            await list();
          } else setJob(next);
        })
        .catch((e) => {
          if (alive) setPollError(message(e));
        })
        .finally(() => {
          pending = false;
        });
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [jobId, jobStatus, refresh, list]);
  useEffect(() => {
    if (!uploading) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [uploading]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--fluid-viewport-height",
        `${viewport.height}px`,
      );
    resize();
    viewport.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--fluid-viewport-height");
    };
  }, []);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    uploadController.current = new AbortController();
    setUploading(true);
    setPercent(0);
    setTab("review");
    setDetails([]);
    try {
      await run(async () => {
        let id = wellId;
        if (!id) {
          const w = await api.createWell(
            files[0].name.replace(/\.[^.]+$/, ""),
            true,
          );
          id = w.id;
          uploadTarget.current = id;
          await list();
          navigate(`/apps/fluidlab/wells/${id}`);
        }
        const target = id;
        const j = await api.uploadFiles(
          target,
          files,
          setPercent,
          (j) => {
            if (currentWell.current === target) setJob(j);
          },
          uploadController.current!.signal,
        );
        if (currentWell.current === target) {
          setJob({ ...j, status: "queued" });
          if (target === wellId) await refresh();
        }
      });
    } finally {
      uploadController.current = null;
      setUploading(false);
      uploadTarget.current = null;
    }
  };
  const openRecord = (record: DataRecord) => {
    detailTrigger.current = document.activeElement as HTMLElement;
    setDetails([{ kind: "record", record }]);
    setSelected(record.id);
  };
  const openSources = async (ids: string[]) => {
    const id = wellId;
    await run(async () => {
      const s = await api.getSources(id!, data?.well.version || null, ids);
      if (currentWell.current === id) {
        if (!details.length)
          detailTrigger.current = document.activeElement as HTMLElement;
        setDetails((prev) => [
          ...prev,
          { kind: "sources", sources: s.sources },
        ]);
      }
    });
  };
  const back = () => {
    setDetails((prev) => prev.slice(0, -1));
    if (details.length === 1)
      requestAnimationFrame(() =>
        detailTrigger.current?.focus({ preventScroll: true }),
      );
  };
  const save = (change: WellChange) =>
    run(async () => {
      if (!data) return;
      await api.saveWell(data.well, change);
      await refresh();
      await list();
    });
  const generate = () =>
    run(async () => {
      if (!data) return;
      setTab("review");
      setJob(await api.generateGeometry(data.well));
      await refresh();
    });
  const choose = (id: string) => {
    if (uploading) return;
    setDetails([]);
    navigate(`/apps/fluidlab/wells/${id}`);
  };
  const problemCount =
    data?.issues.filter((i) => !i.status || i.status === "unresolved").length ||
    0;
  const contentReady = data && data.well.id === wellId;
  return (
    <div className="fluidlab-app">
      <header className="fl-header">
        <Link to="/portal" aria-label="Back to portal">
          <ArrowLeft size={19} />
        </Link>
        <strong>
          <Layers size={22} /> FluidLab
        </strong>
      </header>
      <main
        className={`fl-main${collapsed ? " fl-collapsed" : ""}${tab === "chat" && !details.length ? " fl-chat-active" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <section className="fl-viewer" aria-label="3D well workspace">
          {contentReady && pason.view === "pason" && pason.model ? (
            <div className="fl-scene">
              <SurveyScene
                navigation={survey}
                active={!busy && !processing}
                onLoading={setSceneLoading}
              />
            </div>
          ) : contentReady && data.geometry.length ? (
            <div className="fl-scene">
              <Suspense
                fallback={<PreparingScene onChange={setSceneLoading} />}
              >
                <WellScene
                  key={data.well.id}
                  data={data}
                  branches={data.geometry}
                  selected={selected}
                  highlights={highlights}
                  select={setSelected}
                  mode="losses"
                  report={report}
                  product={null}
                  view={view}
                  fit={fit}
                  capture={capture}
                />
              </Suspense>
            </div>
          ) : (
            <div className="fl-scene-empty">
              <Layers size={48} strokeWidth={1} />
              <h1>
                {active(job)
                  ? "Your well is taking shape."
                  : "See the whole well."}
              </h1>
              <p>
                {active(job)
                  ? "Explore the sidebar while processing continues."
                  : "Select a well or upload reports in Wells."}
              </p>
            </div>
          )}
          {!!data?.geometry.length &&
            (pason.view !== "pason" || !pason.model) && (
              <>
                <div
                  className="fl-view-tools"
                  aria-label="Well camera controls"
                >
                  {["isometric", "top", "side"].map((v) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                    >
                      {v}
                    </button>
                  ))}
                  <button onClick={() => setFit((v) => v + 1)}>Fit</button>
                  <button onClick={() => setCapture((v) => v + 1)}>PNG</button>
                </div>
                <small className="fl-schematic-label">
                  Estimated schematic
                </small>
              </>
            )}
          {data?.well.pason && (
            <div className="fl-source-switch" aria-label="Visualization source">
              <button
                aria-pressed={pason.view === "pason"}
                onClick={() => pason.select("pason")}
              >
                Pason
              </button>
              <button
                aria-pressed={pason.view === "estimated"}
                onClick={() => pason.select("estimated")}
              >
                Estimated
              </button>
            </div>
          )}
        </section>
        <aside className="fl-sidebar" aria-label="Well information">
          <div
            className="fl-sidebar-heading"
            hidden={details.length > 0 && !collapsed}
          >
            <span>{data?.well.name || "WELL INTELLIGENCE"}</span>
            <button
              aria-label={
                collapsed ? "Expand information" : "Collapse information"
              }
              aria-expanded={!collapsed}
              aria-controls="fl-sidebar-content"
              onClick={() => setCollapsed((v) => !v)}
            >
              <span className="fl-mobile-icon">
                {collapsed ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </span>
              <span className="fl-desktop-icon">
                {collapsed ? (
                  <PanelLeftOpen size={18} />
                ) : (
                  <PanelLeftClose size={18} />
                )}
              </span>
            </button>
          </div>
          <div
            className="fl-sidebar-content"
            id="fl-sidebar-content"
            hidden={collapsed}
          >
            {(error || pollError) && (
              <div className="fl-error" role="alert">
                {error || pollError}
                <button
                  aria-label="Dismiss error"
                  onClick={() => {
                    setError("");
                    setPollError("");
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {pason.error && tab !== "wells" && (
              <div role="alert" className="fl-error">
                {pason.error}
                <button onClick={pason.retry}>Retry Pason</button>
              </div>
            )}
            <div className="fl-tabs-shell" hidden={details.length > 0}>
              <nav className="fl-tabs" aria-label="FluidLab sections">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    aria-label={label}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => setTab(id)}
                  >
                    {label}
                    {id === "review" && problemCount > 0 && (
                      <span className="fl-badge">{problemCount}</span>
                    )}
                  </button>
                ))}
              </nav>
              <section
                className="fl-tab-panel"
                hidden={tab !== "wells"}
                aria-label="Wells panel"
              >
                <div className="fl-section-title">
                  <Layers />
                  <div>
                    <small>ONE SHARED LIBRARY</small>
                    <h1>Your wells</h1>
                  </div>
                </div>
                <p className="fl-muted">
                  Available to everyone with Fluid Labs access.
                </p>
                <div className="fl-actions">
                  <button
                    className="fl-primary"
                    disabled={busy || uploading || active(job)}
                    onClick={() => file.current?.click()}
                  >
                    <Upload size={17} />
                    {data ? "Upload to this well" : "Upload spreadsheets"}
                  </button>
                  <button
                    disabled={busy || uploading}
                    onClick={() => {
                      setEditingName(false);
                      setName("");
                      navigate("/apps/fluidlab");
                    }}
                  >
                    <Plus size={17} />
                    New well
                  </button>
                </div>
                <input
                  hidden
                  ref={file}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={(e) => {
                    void upload(Array.from(e.target.files || []));
                    e.target.value = "";
                  }}
                />
                {(!wellId || editingName) && (
                  <form
                    className="fl-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        if (editingName && data) {
                          await api.renameWell(data.well, name);
                          await refresh();
                          setEditingName(false);
                        } else {
                          const w = await api.createWell(name);
                          choose(w.id);
                        }
                        await list();
                        setName("");
                      });
                    }}
                  >
                    <label>
                      {editingName ? "Well name" : "Create a well"}
                      <input
                        aria-label="Well name"
                        value={name}
                        maxLength={150}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Well name"
                        required
                      />
                    </label>
                    <button disabled={busy || !name.trim()}>
                      {editingName ? "Save name" : "Create well"}
                    </button>
                  </form>
                )}
                {data && (
                  <div className="fl-card">
                    <small>SELECTED WELL</small>
                    <h2>{data.well.name}</h2>
                    <div className="fl-inline">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditingName(true);
                          setName(data.well.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        disabled={busy || active(job) || !data.well.version}
                        onClick={() => void generate()}
                      >
                        {data.geometry.length ? "Update 3D" : "Generate 3D"}
                      </button>
                      <button
                        disabled={busy || active(job)}
                        onClick={() => setDeleting((v) => !v)}
                      >
                        Delete
                      </button>
                    </div>
                    {deleting && (
                      <div className="fl-delete-confirm">
                        <p>
                          Delete this shared well and its files for everyone?
                        </p>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api.deleteWell(data.well.id);
                              await list();
                              navigate("/apps/fluidlab");
                            })
                          }
                        >
                          Delete well
                        </button>
                        <button onClick={() => setDeleting(false)}>
                          Keep well
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {data && (
                  <section className="fl-card">
                    <h2>Well view</h2>
                    <p className="fl-muted">
                      Attach a Pason ZIP for survey and drilling detail.
                    </p>
                    <div className="fl-inline">
                      <button
                        disabled={!data.well.pason}
                        aria-pressed={pason.view === "pason"}
                        onClick={() => pason.select("pason")}
                      >
                        Pason
                      </button>
                      <button
                        aria-pressed={pason.view === "estimated"}
                        onClick={() => pason.select("estimated")}
                      >
                        Estimated
                      </button>
                    </div>
                    <div className="fl-actions">
                      <button
                        disabled={!!pason.progress}
                        onClick={() => zipFile.current?.click()}
                      >
                        {data.well.pason
                          ? "Replace Pason ZIP"
                          : "Upload Pason ZIP"}
                      </button>
                      {data.well.pason && (
                        <>
                          <button
                            onClick={() => {
                              detailTrigger.current =
                                document.activeElement as HTMLElement;
                              setDetails([{ kind: "pason" }]);
                            }}
                          >
                            Pason details
                          </button>
                          <button onClick={() => void pason.remove()}>
                            Remove ZIP
                          </button>
                        </>
                      )}
                    </div>
                    <input
                      ref={zipFile}
                      type="file"
                      accept=".zip"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void pason.upload(f);
                      }}
                    />
                    {pason.error && (
                      <div role="alert">
                        {pason.error}
                        <button onClick={pason.retry}>Retry Pason</button>
                      </div>
                    )}
                  </section>
                )}
                <div className="fl-search">
                  <Search size={20} />
                  <input
                    type="search"
                    aria-label="Search all wells"
                    placeholder="Search all wells by name…"
                    value={library.search}
                    onChange={(e) => library.setSearch(e.target.value)}
                  />
                  {library.search && (
                    <button
                      aria-label="Clear well search"
                      onClick={() => library.setSearch("")}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
                {library.loading && <p role="status">Searching wells…</p>}
                {library.error && (
                  <p role="alert">
                    {library.error}
                    <button onClick={() => void list()}>Retry search</button>
                  </p>
                )}
                <div className="fl-list" aria-busy={library.loading}>
                  {wells.map((w) => (
                    <button
                      key={w.id}
                      className="fl-list-card"
                      aria-pressed={w.id === wellId}
                      disabled={uploading}
                      onClick={() => choose(w.id)}
                    >
                      <span className="fl-icon">
                        <Layers size={21} />
                      </span>
                      <span className="fl-card-copy">
                        <strong>{w.name}</strong>
                        <small>
                          {w.summary?.reports || 0} reports ·{" "}
                          {w.summary?.branches || 0} legs
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
                <nav className="fl-pagination" aria-label="Well pages">
                  <button
                    disabled={library.loading || library.page === 0}
                    onClick={library.previous}
                  >
                    Previous
                  </button>
                  <span>Page {library.page + 1}</span>
                  <button
                    disabled={library.loading || !library.next}
                    onClick={library.more}
                  >
                    Next
                  </button>
                </nav>
                {!library.loading && !wells.length && (
                  <p className="fl-muted">
                    {library.search
                      ? "No matching wells."
                      : "Your first upload starts the shared library."}
                  </p>
                )}
              </section>
              <section
                className="fl-tab-panel"
                hidden={tab !== "costs"}
                aria-label="Costs panel"
              >
                {contentReady ? (
                  <Costs
                    data={data}
                    report={report}
                    onReport={setReport}
                    select={openRecord}
                  />
                ) : (
                  <p>
                    {loading
                      ? "Loading well…"
                      : "Select a well in Wells to explore costs."}
                  </p>
                )}
              </section>
              <section
                className="fl-tab-panel"
                hidden={tab !== "mud"}
                aria-label="Mud panel"
              >
                {contentReady ? (
                  <Mud
                    data={data}
                    select={openRecord}
                    analyze={() =>
                      void run(async () => {
                        setJob(await api.analyzeLosses(data.well));
                        await refresh();
                      })
                    }
                    analysisBusy={processing || busy}
                  />
                ) : (
                  <p>
                    {loading
                      ? "Loading well…"
                      : "Select a well in Wells to explore reports."}
                  </p>
                )}
              </section>
              <section
                className="fl-tab-panel"
                hidden={tab !== "review"}
                aria-label="Review panel"
              >
                {(uploading || job) && (
                  <section className="fl-job" role="status">
                    <strong>
                      {uploading
                        ? `Uploading ${percent}%`
                        : active(job)
                          ? job?.kind === "geometry"
                            ? "Building your 3D well"
                            : "Reading your reports"
                          : job?.status === "failed"
                            ? "Processing needs a retry"
                            : job?.status === "cancelled"
                              ? "Processing cancelled"
                              : "Your data is ready"}
                    </strong>
                    <p>{job?.message}</p>
                    {uploading && <progress max={100} value={percent} />}{" "}
                    {job && active(job) && !uploading && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api.cancelImport(job.id);
                            await refresh();
                          })
                        }
                      >
                        {job.kind === "geometry"
                          ? "Cancel 3D generation"
                          : "Cancel import"}
                      </button>
                    )}
                  </section>
                )}
                {contentReady && (
                  <Review
                    data={data}
                    save={save}
                    busy={busy || active(job)}
                    openSources={(ids) => void openSources(ids)}
                  />
                )}
                {!!data?.well.pason?.warnings.length && (
                  <details className="fl-card">
                    <summary>
                      Pason attachment · {data.well.pason.warnings.length}{" "}
                      notices
                    </summary>
                    {data.well.pason.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </details>
                )}
                <details className="fl-card">
                  <summary>Processing history · {history.length}</summary>
                  {history.map((j) => (
                    <div className="fl-history" key={j.id}>
                      <strong>
                        {j.kind === "geometry"
                          ? "3D well"
                          : j.files.map((f) => f.name).join(", ")}
                      </strong>
                      <small>
                        {j.status} · {j.message}
                      </small>
                      {["failed", "cancelled"].includes(j.status) && (
                        <button
                          disabled={busy || active(job)}
                          onClick={() =>
                            void run(async () => {
                              if (
                                j.kind === "geometry" &&
                                (j.version !== data?.well.version ||
                                  j.baseRevision !== data?.well.revision)
                              ) {
                                await generate();
                                return;
                              }
                              await api.retryImport(j.id);
                              setJob({ ...j, status: "queued" });
                            })
                          }
                        >
                          Resume saved progress
                        </button>
                      )}
                      {j.status === "uploading" && !uploading && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await api.completeImport(j.id);
                              setJob({ ...j, status: "queued" });
                            })
                          }
                        >
                          Finish uploaded import
                        </button>
                      )}
                    </div>
                  ))}
                </details>
                {!contentReady && !job && (
                  <p>Upload spreadsheets from Wells to begin.</p>
                )}
              </section>
              <section
                className="fl-tab-panel fl-chat-panel"
                hidden={tab !== "chat"}
                aria-label="Chat panel"
              >
                {contentReady ? (
                  <Chat
                    key={data.well.id}
                    data={data}
                    report={report}
                    product={null}
                    visible={tab === "chat" && !details.length && !collapsed}
                    openSources={(ids) => void openSources(ids)}
                    highlight={(ids) => {
                      setHighlights(ids);
                      setSelected(ids[0] || null);
                    }}
                  />
                ) : (
                  <p>
                    {loading
                      ? "Loading well…"
                      : "Select a well in Wells to start a conversation."}
                  </p>
                )}
              </section>
            </div>
            {details.map((detail, index) => (
              <section
                className="fl-detail"
                key={index}
                hidden={index !== details.length - 1}
              >
                <div className="fl-detail-top">
                  <button
                    className="fl-mobile-minimize"
                    aria-label="Collapse information"
                    onClick={() => setCollapsed(true)}
                  >
                    <ChevronDown size={18} />
                  </button>
                  <button onClick={back}>
                    <ArrowLeft size={17} />
                    Back
                  </button>
                </div>
                <div className="fl-detail-body">
                  {detail.kind === "pason" ? (
                    <>
                      <h1>Pason · {data?.well.name}</h1>
                      {pason.model ? (
                        <>
                          <SurveyControls navigation={survey} />
                          <SurveyDetails
                            navigation={survey}
                            name={data?.well.name}
                            showWarnings={false}
                          />
                          <button
                            onClick={() =>
                              survey.setLabelMode((v) =>
                                v === "off"
                                  ? "smart"
                                  : v === "smart"
                                    ? "all"
                                    : "off",
                              )
                            }
                          >
                            Labels: {survey.labelMode}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => pason.select("pason")}>
                          Open Pason view
                        </button>
                      )}
                    </>
                  ) : detail.kind === "sources" ? (
                    <>
                      <h1>Supporting evidence</h1>
                      {detail.sources.map((s) => (
                        <article className="fl-source" key={s.id}>
                          <small>
                            {s.file} · {s.sheet}!{s.cell}
                          </small>
                          <pre>{s.display}</pre>
                          {s.formula && (
                            <small>Original formula: {s.formula}</small>
                          )}
                        </article>
                      ))}
                      {!detail.sources.length && (
                        <p>No supporting cells available.</p>
                      )}
                    </>
                  ) : contentReady ? (
                    detail.record.kind === "product" ? (
                      <ProductDetail
                        data={data}
                        record={detail.record}
                        report={report}
                        openSources={(ids) => void openSources(ids)}
                      />
                    ) : detail.record.kind === "report" ? (
                      <ReportDetail
                        data={data}
                        record={detail.record}
                        openSources={(ids) => void openSources(ids)}
                      />
                    ) : (
                      <>
                        <h1>{detail.record.label}</h1>
                        <Facts
                          record={detail.record}
                          openSources={(ids) => void openSources(ids)}
                        />
                      </>
                    )
                  ) : null}
                </div>
              </section>
            ))}
          </div>
          {!collapsed && (
            // A keyboard-operable separator resizes the desktop sidebar.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              className="fl-sidebar-resize"
              role="separator"
              aria-label="Resize information sidebar"
              aria-orientation="vertical"
              aria-valuemin={320}
              aria-valuemax={560}
              aria-valuenow={sidebarWidth}
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                setSidebarWidth((w) =>
                  e.key === "Home"
                    ? 320
                    : e.key === "End"
                      ? 560
                      : Math.max(
                          320,
                          Math.min(
                            560,
                            w + (e.key === "ArrowRight" ? 20 : -20),
                          ),
                        ),
                );
              }}
              onPointerDown={(e) =>
                e.currentTarget.setPointerCapture(e.pointerId)
              }
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  setSidebarWidth(
                    Math.max(
                      320,
                      Math.min(
                        560,
                        e.clientX -
                          e.currentTarget.parentElement!.getBoundingClientRect()
                            .left,
                      ),
                    ),
                  );
              }}
              onPointerUp={(e) =>
                e.currentTarget.releasePointerCapture(e.pointerId)
              }
            />
          )}
        </aside>
      </main>
      {pason.pending && !pason.progress && (
        <PackageDetailDialog
          manifest={pason.pending}
          onCancel={pason.cancel}
          onConfirm={(d) => void pason.save(d)}
        />
      )}
      {!pason.pending &&
        (loading ||
          busy ||
          uploading ||
          (processing && !pollError) ||
          pason.progress ||
          sceneLoading) && (
          <LoadingOverlay
            message={
              pason.progress?.message ||
              (uploading
                ? "Uploading reports…"
                : loading
                  ? "Opening well…"
                  : processing
                    ? job?.message || "Analyzing your well…"
                    : sceneLoading
                      ? "Preparing 3D view…"
                      : "Saving changes…")
            }
            percent={
              pason.progress?.percent ??
              (uploading
                ? percent
                : processing && job?.total
                  ? Math.round((100 * (job.completed || 0)) / job.total)
                  : null)
            }
            onCancel={
              uploading
                ? () => uploadController.current?.abort()
                : pason.progress
                  ? pason.cancel
                  : processing
                    ? () =>
                        void api
                          .cancelImport(job!.id)
                          .then(refresh)
                          .catch((e) => setPollError(message(e)))
                    : undefined
            }
          />
        )}
    </div>
  );
}
