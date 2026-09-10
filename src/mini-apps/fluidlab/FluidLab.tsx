import Confirmation from "./Confirmation";
import { useAutoRotation } from "./AutoRotation";
import SceneViewport from "./SceneViewport";
import LoadingOverlay from "./loading/LoadingOverlay";
import PackageDetailChoice from "./pason/PackageDetailChoice";
import { useWellSearch } from "./useWellSearch";
import { usePason } from "./usePason";
import {
  SurveyScene,
  SurveyDetails,
  SurveyControls,
  useSurveyNavigation,
} from "./pason/SurveyWorkspace";
import "./pason/pason.css";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  Route,
  Box,
  SlidersHorizontal,
  FileArchive,
  RefreshCw,
  Trash2,
  Pencil,
  MapPin,
  ClipboardCheck,
  RotateCw,
  Tags,
  Play,
  Pause,
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
  ["wells", "All wells"],
  ["well", "Well"],
  ["costs", "Costs"],
  ["mud", "Mud"],
  ["chat", "Chat"],
];
export default function FluidLab({
  wellId,
  navigate,
}: {
  wellId?: string;
  navigate: (url: string) => void;
}) {
  const rotation = useAutoRotation();
  const [confirmation, setConfirmation] = useState<
    "exit" | "remove" | File | null
  >(null);
  const [data, setData] = useState<Dataset | null>(null),
    [tab, setTab] = useState(wellId ? "well" : "wells"),
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
    [highlights, setHighlights] = useState<string[]>([]),
    [name, setName] = useState(""),
    [editingName, setEditingName] = useState(false),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    currentWell = useRef(wellId),
    uploadDestination = useRef<string | null>(null),
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
      setTab(wellId ? "well" : "wells");
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
  const jobWellId = job?.wellId,
    jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    if (
      !jobId ||
      !jobWellId ||
      !["queued", "processing", "uploading"].includes(jobStatus || "")
    )
      return;
    let alive = true,
      pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void api
        .getImport(jobWellId, jobId)
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
  }, [jobWellId, jobId, jobStatus, refresh, list]);
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
  const upload = async (files: File[], destination: string | null) => {
    if (!files.length) return;
    uploadController.current = new AbortController();
    setUploading(true);
    setPercent(0);
    setTab("well");
    setDetails([]);
    try {
      await run(async () => {
        let id = destination;
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
      setTab("well");
      setJob(await api.generateGeometry(data.well));
      await refresh();
    });
  const choose = (id: string) => {
    if (uploading) return;
    setDetails([]);
    setTab("well");
    setCreating(false);
    navigate(`/apps/fluidlab/wells/${id}`);
  };
  const problemCount =
    data?.issues.filter((i) => !i.status || i.status === "unresolved").length ||
    0;
  const contentReady = data && data.well.id === wellId;
  return (
    <div className="fluidlab-app">
      <header className="fl-header">
        <button
          aria-label="Back to portal"
          onClick={() => setConfirmation("exit")}
        >
          <ArrowLeft size={19} />
        </button>
        <strong>
          <Layers size={22} /> FluidLab
        </strong>
      </header>
      <main
        className={`fl-main${collapsed ? " fl-collapsed" : ""}${tab === "chat" && !details.length ? " fl-chat-active" : ""}`}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <section className="fl-viewer" aria-label="3D well workspace">
          <SceneViewport
            autoRotate={rotation.enabled}
            motionBlocked={
              !!confirmation ||
              loading ||
              busy ||
              uploading ||
              processing ||
              sceneLoading ||
              !!pason.progress ||
              !!pason.pending
            }
            sceneKey={`${wellId || "empty"}:${pason.view === "pason" && pason.model ? "pason" : "estimated"}`}
          >
            {contentReady && pason.view === "pason" && pason.model ? (
              <>
                <SurveyScene
                  navigation={survey}
                  active={!busy && !processing}
                  onLoading={setSceneLoading}
                />
              </>
            ) : contentReady && data.geometry.length ? (
              <>
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
                  />
                </Suspense>
              </>
            ) : null}
          </SceneViewport>
          {!contentReady ||
          (!data.geometry.length &&
            !(pason.view === "pason" && pason.model)) ? (
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
                  : "Select a well or upload reports in All wells."}
              </p>
            </div>
          ) : null}
          {!!data?.geometry.length &&
            (pason.view !== "pason" || !pason.model) && (
              <small className="fl-schematic-label">Estimated schematic</small>
            )}
        </section>
        <aside className="fl-sidebar" aria-label="Well information">
          {collapsed && (
            <button
              className="fl-mobile-expand"
              aria-label="Expand well information"
              aria-expanded={false}
              aria-controls="fl-sidebar-content"
              onClick={() => setCollapsed(false)}
            >
              <span>{data?.well.name || "All wells"}</span>
              <ChevronUp size={18} />
            </button>
          )}
          <div
            className={`fl-sidebar-heading${collapsed ? " fl-heading-collapsed" : ""}`}
            hidden={(details.length > 0 || !!pason.pending) && !collapsed}
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
            {pason.error && tab !== "well" && (
              <div role="alert" className="fl-error">
                {pason.error}
                <button onClick={pason.retry}>Retry Pason</button>
              </div>
            )}
            <div
              className="fl-tabs-shell"
              hidden={details.length > 0 || !!pason.pending}
            >
              <nav className="fl-tabs" aria-label="FluidLab sections">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    aria-label={label}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => setTab(id)}
                  >
                    {label}
                    {id === "well" && problemCount > 0 && (
                      <span className="fl-badge">{problemCount}</span>
                    )}
                  </button>
                ))}
              </nav>
              <section
                className="fl-tab-panel"
                hidden={tab !== "wells"}
                aria-label="All wells panel"
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
                    disabled={busy || uploading}
                    onClick={() => {
                      uploadDestination.current = null;
                      file.current?.click();
                    }}
                  >
                    <Upload size={17} />
                    Upload reports to a new well
                  </button>
                  <button
                    disabled={busy || uploading}
                    onClick={() => {
                      setCreating(true);
                      setName("");
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
                    void upload(
                      Array.from(e.target.files || []),
                      uploadDestination.current,
                    );
                    e.target.value = "";
                  }}
                />
                {creating && (
                  <form
                    className="fl-edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const w = await api.createWell(name);
                        choose(w.id);
                        await list();
                        setName("");
                      });
                    }}
                  >
                    <label>
                      New well name
                      <input
                        aria-label="New well name"
                        value={name}
                        maxLength={150}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </label>
                    <button disabled={busy || !name.trim()}>Create well</button>
                    <button type="button" onClick={() => setCreating(false)}>
                      Cancel
                    </button>
                  </form>
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
                {!library.loading && !library.error && !wells.length && (
                  <p className="fl-muted">
                    {library.search
                      ? "No matching wells."
                      : "Your first upload starts the shared library."}
                  </p>
                )}
              </section>
              <section
                className="fl-tab-panel"
                hidden={tab !== "well"}
                aria-label="Well panel"
              >
                {contentReady ? (
                  <>
                    <div className="fl-actions">
                      <button
                        className="fl-primary"
                        disabled={busy || uploading || active(job)}
                        onClick={() => {
                          uploadDestination.current = data.well.id;
                          file.current?.click();
                        }}
                      >
                        <Upload size={17} />
                        Upload reports to this well
                      </button>
                    </div>
                    {editingName && (
                      <form
                        className="fl-edit-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await api.renameWell(data.well, name);
                            await refresh();
                            setEditingName(false);
                            await list();
                            setName("");
                          });
                        }}
                      >
                        <label>
                          Well name
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
                          Save name
                        </button>
                      </form>
                    )}
                    {data && (
                      <div className="fl-card">
                        <div className="fl-card-heading">
                          <MapPin aria-hidden="true" />
                          <small>SELECTED WELL</small>
                        </div>
                        <h2>{data.well.name}</h2>
                        <div className="fl-inline">
                          <button
                            disabled={busy}
                            onClick={() => {
                              setEditingName(true);
                              setName(data.well.name);
                            }}
                          >
                            <Pencil size={16} aria-hidden="true" /> Rename
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
                            <Trash2 size={16} aria-hidden="true" /> Delete
                          </button>
                        </div>
                        {deleting && (
                          <div className="fl-delete-confirm">
                            <p>
                              Delete this shared well and its files for
                              everyone?
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
                      <section className="fl-card fl-well-view">
                        <div className="fl-card-heading">
                          <Box aria-hidden="true" />
                          <div>
                            <h2>Well view</h2>
                            <p className="fl-muted">
                              Choose how to explore this well.
                            </p>
                          </div>
                        </div>
                        <div
                          className="fl-view-selector"
                          role="group"
                          aria-label="Visualization source"
                          data-camera-tools
                        >
                          <button
                            disabled={!data.well.pason}
                            aria-pressed={pason.view === "pason"}
                            onClick={() => pason.select("pason")}
                          >
                            <Route aria-hidden="true" />
                            <span>
                              Pason<small>Survey & drilling detail</small>
                            </span>
                          </button>
                          <button
                            aria-pressed={pason.view === "estimated"}
                            onClick={() => pason.select("estimated")}
                          >
                            <Box aria-hidden="true" />
                            <span>
                              Estimated<small>Report-based schematic</small>
                            </span>
                          </button>
                        </div>
                        <div className="fl-active-tools" data-camera-tools>
                          {pason.view === "pason" && data.well.pason ? (
                            <button
                              className="fl-tools-entry"
                              onClick={() => {
                                detailTrigger.current =
                                  document.activeElement as HTMLElement;
                                setDetails([{ kind: "pason" }]);
                              }}
                            >
                              <SlidersHorizontal aria-hidden="true" />
                              <span>
                                <strong>Pason Tools</strong>
                                <small>
                                  Labels, casing, depth and survey details
                                </small>
                              </span>
                              <ChevronRight aria-hidden="true" />
                            </button>
                          ) : (
                            <div
                              className="fl-orientations"
                              aria-label="Estimated camera orientation"
                            >
                              {["isometric", "top", "side"].map((v) => (
                                <button
                                  key={v}
                                  aria-pressed={view === v}
                                  onClick={() => setView(v)}
                                >
                                  <Box size={16} aria-hidden="true" />
                                  {v}
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            className="fl-auto-rotate"
                            aria-pressed={rotation.enabled}
                            onClick={rotation.toggle}
                          >
                            <RotateCw size={17} aria-hidden="true" />
                            <span>Auto-rotate</span>
                            <small>{rotation.enabled ? "On" : "Off"}</small>
                            {rotation.enabled ? (
                              <Pause size={15} aria-hidden="true" />
                            ) : (
                              <Play size={15} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        <div className="fl-attachment">
                          <div className="fl-card-heading">
                            <FileArchive size={20} aria-hidden="true" />
                            <div>
                              <strong>Pason attachment</strong>
                              <p className="fl-muted">
                                {data.well.pason?.originalName ||
                                  "Upload a Pason ZIP to unlock survey and drilling tools."}
                              </p>
                            </div>
                          </div>
                          <div className="fl-actions">
                            <button
                              className={!data.well.pason ? "fl-primary" : ""}
                              disabled={!!pason.progress}
                              onClick={() => zipFile.current?.click()}
                            >
                              {data.well.pason ? (
                                <RefreshCw size={16} aria-hidden="true" />
                              ) : (
                                <Upload size={16} aria-hidden="true" />
                              )}
                              {data.well.pason
                                ? "Replace Pason ZIP"
                                : "Upload Pason ZIP"}
                            </button>
                            {data.well.pason && (
                              <button
                                className="fl-remove-zip"
                                disabled={!!pason.progress}
                                onClick={() => setConfirmation("remove")}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                                Remove ZIP
                              </button>
                            )}
                          </div>
                        </div>
                        <input
                          ref={zipFile}
                          type="file"
                          accept=".zip"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) {
                              if (data.well.pason) setConfirmation(f);
                              else void pason.upload(f);
                            }
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
                    <section aria-label="Review" className="fl-well-review">
                      <h2 className="fl-card-heading">
                        <ClipboardCheck aria-hidden="true" /> Review{" "}
                        <span className="fl-badge">{problemCount}</span>
                      </h2>
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
                          {uploading && (
                            <progress max={100} value={percent} />
                          )}{" "}
                          {job && active(job) && !uploading && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await api.cancelImport(job!.wellId, job.id);
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
                                    await api.retryImport(j.wellId, j.id);
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
                                    await api.completeImport(j.wellId, j.id);
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
                        <p>Upload reports to this well to begin.</p>
                      )}
                    </section>
                  </>
                ) : (
                  <p>
                    {loading
                      ? "Loading well…"
                      : "Select or create a well in All wells."}
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
                      : "Select a well in All wells to explore costs."}
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
                      : "Select a well in All wells to explore reports."}
                  </p>
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
                      : "Select a well in All wells to start a conversation."}
                  </p>
                )}
              </section>
            </div>
            {pason.pending && !pason.progress && (
              <section className="fl-detail" aria-label="ZIP detail choice">
                <PackageDetailChoice
                  manifest={pason.pending}
                  onCancel={pason.cancel}
                  onConfirm={(d) => void pason.save(d)}
                  onMinimize={() => setCollapsed(true)}
                />
              </section>
            )}
            {details.map((detail, index) => (
              <section
                className="fl-detail"
                key={index}
                hidden={index !== details.length - 1 || !!pason.pending}
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
                <div
                  className="fl-detail-body"
                  data-camera-tools={detail.kind === "pason" ? "" : undefined}
                >
                  {detail.kind === "pason" ? (
                    <>
                      <h1 className="fl-card-heading">
                        <SlidersHorizontal aria-hidden="true" />
                        Pason Tools
                      </h1>
                      <p className="fl-muted">{data?.well.name}</p>
                      {pason.model ? (
                        <>
                          {pason.view === "pason" ? (
                            <div data-camera-tools>
                              <SurveyControls navigation={survey} />
                              <button
                                className="fl-auto-rotate"
                                aria-pressed={rotation.enabled}
                                onClick={rotation.toggle}
                              >
                                <RotateCw size={17} aria-hidden="true" />
                                Auto-rotate: {rotation.enabled ? "On" : "Off"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => pason.select("pason")}>
                              Open Pason view
                            </button>
                          )}
                          {pason.view === "pason" && (
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
                              <Tags size={16} aria-hidden="true" /> Labels:{" "}
                              {survey.labelMode}
                            </button>
                          )}
                          {pason.view === "pason" && (
                            <SurveyDetails
                              navigation={survey}
                              name={data?.well.name}
                              showWarnings={false}
                            />
                          )}
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
              data-camera-tools
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
                          .cancelImport(job!.wellId, job!.id)
                          .then(refresh)
                          .catch((e) => setPollError(message(e)))
                    : undefined
            }
          />
        )}
      {confirmation && (
        <Confirmation
          title={
            confirmation === "exit"
              ? "Leave Fluid Labs?"
              : confirmation === "remove"
                ? "Remove Pason attachment?"
                : "Replace Pason attachment?"
          }
          cancelLabel={
            confirmation === "exit" ? "Stay here" : "Keep attachment"
          }
          confirmLabel={
            confirmation === "exit"
              ? "Exit to portal"
              : confirmation === "remove"
                ? "Remove attachment"
                : "Replace attachment"
          }
          destructive={confirmation !== "exit"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation;
            setConfirmation(null);
            if (action === "exit") navigate("/portal");
            else if (action === "remove") void pason.remove();
            else void pason.upload(action);
          }}
        >
          {confirmation === "exit" ? (
            <p>
              Saved wells remain available. Unsaved edits and unsent messages
              are not retained when you leave.
            </p>
          ) : (
            <>
              <p>
                {confirmation === "remove"
                  ? "This removes the Pason attachment for everyone using this shared well. The estimated view and report data remain available."
                  : "The current attachment stays available until the replacement is ready. This changes the attachment for everyone using this shared well."}
              </p>
              <p>
                <strong>Current attachment</strong>
                <span>{data?.well.pason?.originalName}</span>
              </p>
              {confirmation instanceof File && (
                <p>
                  <strong>Replacement</strong>
                  <span>{confirmation.name}</span>
                </p>
              )}
            </>
          )}
        </Confirmation>
      )}
    </div>
  );
}
