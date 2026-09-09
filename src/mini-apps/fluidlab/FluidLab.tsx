import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Box,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Layers3,
  Maximize2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import * as api from "./api";
import {
  Analytics,
  Chat,
  Editor,
  Empty,
  Facts,
  Inventory,
  Operations,
  Overview,
  WellboreEditor,
} from "./Panels";
import WellScene from "./WellScene";
import {
  dateLabel,
  money,
  reportRecords,
  value,
  validateBranches,
  type Branch,
  type Dataset,
  type ImportJob,
  type Source,
  type Version,
  type Well,
} from "./model";
import "./fluidlab.css";

const tabs = [
  { id: "wells", label: "Wells", icon: FolderOpen },
  { id: "overview", label: "Overview", icon: Box },
  { id: "inventory", label: "Inventory", icon: Layers3 },
  { id: "operations", label: "Mud & operations", icon: Activity },
  { id: "editor", label: "Well editor", icon: Settings2 },
  { id: "chat", label: "AI chat", icon: MessageSquare },
];
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
export default function FluidLab({
  wellId,
  navigate,
}: {
  wellId: string;
  navigate: (path: string) => void;
}) {
  const [wells, setWells] = useState<Well[]>([]),
    [data, setData] = useState<Dataset | null>(null),
    [tab, setTab] = useState("wells"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(""),
    [name, setName] = useState(""),
    [uploading, setUploading] = useState(false),
    [progress, setProgress] = useState(0),
    [job, setJob] = useState<ImportJob | null>(null),
    [history, setHistory] = useState<{
      versions: Version[];
      imports: ImportJob[];
    }>({ versions: [], imports: [] });
  const [branches, setBranches] = useState<Branch[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [report, setReport] = useState<string | null>(null),
    [product, setProduct] = useState<string | null>(null),
    [highlights, setHighlights] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false),
    [width, setWidth] = useState(360),
    [bottomOpen, setBottomOpen] = useState(true),
    [view, setView] = useState("isometric"),
    [mode, setMode] = useState("structure"),
    [fit, setFit] = useState(0),
    [capture, setCapture] = useState(0),
    [playing, setPlaying] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false),
    [sources, setSources] = useState<Source[]>([]),
    [sourceQuery, setSourceQuery] = useState(""),
    [sourceTotal, setSourceTotal] = useState(0),
    [sourceNext, setSourceNext] = useState<number | null>(null),
    [sourceIds, setSourceIds] = useState<string[] | undefined>(),
    [sourceBusy, setSourceBusy] = useState(false);
  const [geometryStatus, setGeometryStatus] = useState("Saved");
  const sourcePanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sourceOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sourcePanel.current;
    panel?.querySelector<HTMLElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSourceOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [sourceOpen]);
  const geometrySaving = useRef(false),
    geometryFailed = useRef("");
  const fileInput = useRef<HTMLInputElement>(null),
    dragging = useRef(false),
    currentWell = useRef(wellId);
  useEffect(() => {
    currentWell.current = wellId;
  }, [wellId]);
  const refreshList = useCallback(
    async () => setWells(await api.listWells()),
    [],
  );
  const refresh = useCallback(async () => {
    if (!wellId) return;
    const [next, h] = await Promise.all([
      api.getWell(wellId),
      api.getHistory(wellId),
    ]);
    if (currentWell.current !== wellId) return;
    setData(next);
    setHistory(h);
    return next;
  }, [wellId]);
  useEffect(() => {
    void api
      .listWells()
      .then(setWells)
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(async () => {
      setData(null);
      setSelected(null);
      setReport(null);
      setProduct(null);
      setJob(null);
      setPlaying(false);
      setError("");
      if (!wellId) {
        setTab("wells");
        return;
      }
      setLoading(true);
      try {
        const [next, h] = await Promise.all([
          api.getWell(wellId),
          api.getHistory(wellId),
        ]);
        if (!alive) return;
        setData(next);
        setBranches(next.geometry);
        setHistory(h);
        setTab(next.records.length ? "overview" : "wells");
        setJob(
          h.imports.find((j) =>
            ["uploading", "queued", "processing"].includes(j.status),
          ) ?? null,
        );
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [wellId]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const next = await api.getImport(job.id);
        if (!alive) return;
        setJob(next);
        if (["ready", "partial"].includes(next.status)) {
          const d = await refresh();
          if (d) {
            setBranches(d.geometry);
            setTab("overview");
          }
          await refreshList();
        }
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [job, refresh, refreshList]);
  const reports = useMemo(() => (data ? reportRecords(data) : []), [data]);
  useEffect(() => {
    if (!playing || !reports.length) return;
    const timer = setInterval(
      () =>
        setReport(
          (r) =>
            reports[
              (reports.findIndex((x) => x.label === r) + 1) % reports.length
            ].label,
        ),
      1500,
    );
    return () => clearInterval(timer);
  }, [playing, reports]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (dragging.current)
        setWidth(Math.max(290, Math.min(600, e.clientX - 72)));
    };
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        uploading ||
        (data && JSON.stringify(branches) !== JSON.stringify(data.geometry))
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading, data, branches]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const select = (id: string) => {
    setSelected(id);
    const r = data?.records.find((r) => r.id === id);
    if (r?.kind === "product") {
      setProduct(r.label);
      setTab("inventory");
    }
    if (r?.kind === "report") setReport(r.label);
    if (r?.report) setReport(r.report);
  };
  const sourceFetch = async (ids?: string[], query = "", offset = 0) => {
    if (!data) return;
    setSourceBusy(true);
    try {
      const result = await api.getSources(
        data.well.id,
        data.well.version,
        ids,
        query,
        offset,
      );
      setSources(result.sources);
      setSourceTotal(result.total);
      setSourceNext(result.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSourceBusy(false);
    }
  };
  const openSources = (ids: string[]) => {
    setSourceOpen(true);
    setSourceQuery("");
    const filter = ids.length ? ids : undefined;
    setSourceIds(filter);
    void sourceFetch(filter);
  };
  useEffect(() => {
    if (!data) return;
    const encoded = JSON.stringify(branches);
    if (
      encoded === JSON.stringify(data.geometry) ||
      encoded === geometryFailed.current
    )
      return;
    const timer = setTimeout(async () => {
      if (geometrySaving.current) return;
      const invalid = validateBranches(branches);
      if (invalid) {
        setGeometryStatus(invalid);
        return;
      }
      geometrySaving.current = true;
      setGeometryStatus("Saving…");
      try {
        const result = await api.saveWell(data.well, { geometry: branches });
        setData((d) =>
          d && d.well.id === data.well.id
            ? { ...d, geometry: branches, well: { ...d.well, ...result } }
            : d,
        );
        setGeometryStatus("Saved");
        geometryFailed.current = "";
      } catch (e) {
        geometryFailed.current = encoded;
        setGeometryStatus("Not saved · reload to resolve conflict");
        setError(errorText(e));
      } finally {
        geometrySaving.current = false;
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [branches, data]);
  const correct = async (recordId: string, field: string, newValue: string) => {
    if (!data) return;
    try {
      await api.saveWell(data.well, {
        correction: { recordId, field, value: newValue },
      });
      await refresh();
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  };
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      let id = wellId;
      if (!id) {
        const well = await api.createWell(
          name.trim() || files[0].name.replace(/\.[^.]+$/, ""),
          !name.trim(),
        );
        id = well.id;
        navigate(`/apps/fluidlab/wells/${id}`);
      }
      const started = await api.uploadFiles(id, files, setProgress, setJob);
      setJob({ ...started, status: "queued" });
      await refreshList();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const record = data?.records.find((r) => r.id === selected);
  const activeReport = data?.records.find(
    (r) => r.kind === "report" && r.label === report,
  );
  const activeJob =
    job && ["uploading", "queued", "processing"].includes(job.status);
  return (
    <main
      className={`fl-app ${collapsed ? "fl-collapsed" : ""}`}
      style={{ "--fl-sidebar": `${width}px` } as CSSProperties}
    >
      <header className="fl-header">
        <Link to="/portal" className="fl-back" aria-label="Back to portal">
          <ArrowLeft size={18} />
        </Link>
        <div className="workspace-brand">
          <div className="fl-logo">
            <Layers3 size={20} />
          </div>
          <b>
            FluidLab<span>WELL INTELLIGENCE</span>
          </b>
        </div>
        <div className="fl-header-divider" />
        <span className="fl-header-well">
          {data?.well.name || "Your drilling story, connected."}
        </span>
        <div className="fl-header-actions">
          {data && (
            <span className="fl-version">Revision {data.well.revision}</span>
          )}
          <button
            className="fl-secondary"
            onClick={() => {
              setTab("wells");
              setCollapsed(false);
              fileInput.current?.click();
            }}
            disabled={uploading || !!activeJob}
          >
            <Upload size={14} /> Import data
          </button>
        </div>
      </header>
      <nav className="fl-rail" aria-label="FluidLab sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            title={t.label}
            aria-label={t.label}
            disabled={t.id !== "wells" && !data}
            onClick={() => {
              setTab(t.id);
              setCollapsed(false);
            }}
          >
            <t.icon size={20} />
            <span>
              {t.id === "operations"
                ? "Mud"
                : t.id === "inventory"
                  ? "Costs"
                  : t.id === "editor"
                    ? "Editor"
                    : t.id === "chat"
                      ? "Chat"
                      : t.label}
            </span>
          </button>
        ))}
        <button
          className="fl-rail-bottom"
          title="Browse original data"
          aria-label="Browse original data"
          disabled={!data}
          onClick={() => openSources([])}
        >
          <Database size={20} />
          <span>Sources</span>
        </button>
      </nav>
      <aside className="fl-sidebar">
        <div className="fl-sidebar-heading">
          <span>{tabs.find((t) => t.id === tab)?.label}</span>
          <button
            aria-label="Collapse sidebar"
            onClick={() => setCollapsed(true)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="fl-sidebar-content">
          {tab === "wells" ? (
            <>
              <div className="fl-eyebrow">PRIVATE WELL LIBRARY</div>
              <h2>
                From spreadsheets
                <br />
                to a clearer picture.
              </h2>
              <p className="fl-muted">
                Bring your reports together. Explore the well, trace product
                usage, and understand what drove the cost.
              </p>
              <div className="fl-upload-card">
                <FileSpreadsheet size={30} />
                <strong>
                  {wellId ? "Update this well" : "Start with your data"}
                </strong>
                <p>
                  XLSX, XLS, CSV or TSV
                  <br />
                  Up to 5 files · 20 MB each
                </p>
                <button
                  className="fl-primary"
                  disabled={uploading || !!activeJob}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={15} />
                  {uploading
                    ? `Uploading ${progress}%`
                    : wellId
                      ? "Upload updated reports"
                      : "Choose spreadsheets"}
                </button>
                {wellId && (
                  <button
                    className="fl-text-button"
                    onClick={() => navigate("/apps/fluidlab")}
                  >
                    Create a different well
                  </button>
                )}
              </div>
              <form
                className="fl-create-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const well = await api.createWell(name);
                    setName("");
                    await refreshList();
                    navigate(`/apps/fluidlab/wells/${well.id}`);
                  });
                }}
              >
                <input
                  aria-label="New well name"
                  placeholder="Or create an empty well…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={150}
                />
                <button
                  aria-label="Create well"
                  disabled={busy || !name.trim()}
                >
                  <Plus size={18} />
                </button>
              </form>
              <div className="fl-search">
                <Search size={15} />
                <input
                  aria-label="Search wells"
                  placeholder="Search your wells"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="fl-well-list">
                {wells
                  .filter((w) =>
                    w.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((w) => (
                    <button
                      key={w.id}
                      className={wellId === w.id ? "active" : ""}
                      onClick={() => navigate(`/apps/fluidlab/wells/${w.id}`)}
                    >
                      <span>
                        <FolderOpen size={16} />
                        <b>{w.name}</b>
                      </span>
                      <small>
                        {w.status} ·{" "}
                        {new Date(w.updatedAt).toLocaleDateString()}
                      </small>
                      {w.summary?.totalCost && (
                        <strong>{money(w.summary.totalCost)}</strong>
                      )}
                    </button>
                  ))}
              </div>
              {data && (
                <>
                  <div className="fl-inline">
                    <button
                      className="fl-text-button"
                      onClick={() => {
                        const next = window.prompt("Well name", data.well.name);
                        if (next)
                          void run(async () => {
                            await api.renameWell(data.well, next);
                            await refresh();
                            await refreshList();
                          });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="fl-text-button fl-amber"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete ${data.well.name}, its imports, and conversations?`,
                          )
                        )
                          void run(async () => {
                            await api.deleteWell(wellId);
                            await refreshList();
                            navigate("/apps/fluidlab");
                          });
                      }}
                    >
                      Delete well
                    </button>
                  </div>
                  <h3>Import history</h3>
                  {history.imports.map((j) => (
                    <div className="fl-card" key={j.id}>
                      <b>{j.files.map((f) => f.name).join(", ")}</b>
                      <p className="fl-muted">
                        {j.status} ·{" "}
                        {new Date(j.createdAt).toLocaleDateString()}
                      </p>
                      {j.message && <p>{j.message}</p>}
                      {["failed", "partial"].includes(j.status) && (
                        <button
                          onClick={() =>
                            void run(async () => {
                              await api.retryImport(j.id);
                              setJob({ ...j, status: "queued" });
                            })
                          }
                        >
                          Retry extraction
                        </button>
                      )}
                      {j.status === "uploading" && (
                        <button
                          onClick={() =>
                            void run(async () => {
                              await api.completeImport(j.id);
                              setJob({ ...j, status: "queued" });
                            })
                          }
                        >
                          Resume processing uploaded files
                        </button>
                      )}
                    </div>
                  ))}
                  <details>
                    <summary>
                      Dataset versions · {history.versions.length}
                    </summary>
                    {history.versions.map((v) => (
                      <div className="fl-version-row" key={v.id}>
                        <span>
                          r{v.revision} · {v.reason}
                          <small>
                            {new Date(v.createdAt).toLocaleString()}
                          </small>
                        </span>
                        <button
                          disabled={busy || v.id === data.well.version}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Restore this dataset version? This creates a new version.",
                              )
                            )
                              void run(async () => {
                                await api.restoreVersion(data.well, v.id);
                                const d = await refresh();
                                if (d) setBranches(d.geometry);
                              });
                          }}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </details>
                </>
              )}
            </>
          ) : data ? (
            tab === "overview" ? (
              <Overview data={data} select={select} openSources={openSources} />
            ) : tab === "inventory" ? (
              <Inventory
                data={data}
                product={product}
                report={report}
                onProduct={setProduct}
                select={select}
                openSources={openSources}
              />
            ) : tab === "operations" ? (
              <Operations data={data} report={report} select={select} />
            ) : tab === "editor" ? (
              <>
                <Editor
                  key={data.well.id}
                  data={data}
                  branches={branches}
                  onChange={(next) => {
                    setBranches(next);
                    setGeometryStatus("Unsaved");
                  }}
                  status={geometryStatus}
                  selected={selected}
                  select={setSelected}
                />
                <WellboreEditor
                  key={data.well.id + "-main"}
                  data={data}
                  onSave={async (wellbore) => {
                    await api.saveWell(data.well, { wellbore });
                    await refresh();
                  }}
                />
              </>
            ) : (
              <Chat
                key={data.well.id}
                data={data}
                openSources={openSources}
                highlight={(ids) => {
                  setHighlights(ids);
                  if (ids[0]) select(ids[0]);
                  setFit((f) => f + 1);
                }}
              />
            )
          ) : null}
        </div>
        <button
          className="fl-resizer"
          aria-label="Resize sidebar"
          onPointerDown={() => {
            dragging.current = true;
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => Math.max(290, w - 20));
            if (e.key === "ArrowRight") setWidth((w) => Math.min(600, w + 20));
          }}
        />
      </aside>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv,.tsv"
        hidden
        onChange={(e) => void upload(Array.from(e.target.files || []))}
      />
      <section className="fl-workspace">
        {collapsed && (
          <button
            className="fl-expand"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        {error && (
          <div className="fl-toast fl-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {job && (
          <div
            className={`fl-job ${job.status === "failed" ? "fl-error" : ""}`}
            role="status"
          >
            <span className={activeJob ? "fl-pulse" : ""} />
            <b>
              {job.status === "partial"
                ? "Imported · review findings"
                : job.status}
            </b>
            <span>
              {job.message ||
                "Your files will keep processing if you leave this page."}
            </span>
            {!uploading && ["uploading", "queued"].includes(job.status) && (
              <button
                onClick={() =>
                  void run(async () => {
                    await api.cancelImport(job.id);
                    setJob({ ...job, status: "cancelled" });
                    await refresh();
                  })
                }
              >
                Cancel import
              </button>
            )}
            {job.total && (
              <small>
                {job.completed}/{job.total} sheets
              </small>
            )}
            {!["queued", "processing", "uploading"].includes(job.status) && (
              <button
                aria-label="Dismiss import status"
                onClick={() => setJob(null)}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="fl-loading">
            <div className="fl-spinner" />
            Opening well…
          </div>
        ) : data && data.records.length ? (
          <>
            <div className="fl-viewport">
              <WellScene
                data={data}
                branches={branches}
                selected={selected}
                highlights={highlights}
                select={select}
                mode={mode}
                report={report}
                product={product}
                view={view}
                fit={fit}
                capture={capture}
              />
              <div className="fl-scene-heading">
                <span className="fl-eyebrow">
                  {mode === "cost"
                    ? "ESTIMATED COST ALLOCATION"
                    : mode === "losses"
                      ? "REPORTED FLUID LOSSES"
                      : mode === "product"
                        ? "PRODUCT · REPORT ASSOCIATIONS"
                        : "EDITABLE WELL RECONSTRUCTION"}
                </span>
                <h1>{report || "Whole well"}</h1>
                <p>
                  {branches.length} branches · schematic where survey data is
                  missing
                </p>
              </div>
              <div className="fl-scene-tools">
                <select
                  aria-label="Well visualization"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="structure">Well structure</option>
                  <option value="losses">Fluid losses</option>
                  <option value="cost">Estimated costs</option>
                  <option value="product">Selected product</option>
                </select>
                <select
                  aria-label="Camera view"
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                >
                  <option value="isometric">Isometric</option>
                  <option value="top">Top</option>
                  <option value="side">Side</option>
                </select>
                <button
                  title="Fit well"
                  aria-label="Fit well"
                  onClick={() => setFit((f) => f + 1)}
                >
                  <Maximize2 size={16} />
                </button>
                <button
                  title="Export PNG"
                  aria-label="Export PNG"
                  onClick={() => setCapture((c) => c + 1)}
                >
                  <Download size={16} />
                </button>
              </div>
              <div className="fl-legend">
                <span>
                  <i />{" "}
                  {mode === "cost"
                    ? "Estimated · not measured usage"
                    : mode === "losses"
                      ? "Teal → amber: lower → higher losses"
                      : "Documented legs · inferred spatial layout"}
                </span>
                <small>Diameter exaggerated for visibility</small>
              </div>
              {(report || product) && (
                <div className="fl-active-filters">
                  {report && (
                    <button onClick={() => setReport(null)}>
                      {report}
                      <X size={12} />
                    </button>
                  )}
                  {product && (
                    <button onClick={() => setProduct(null)}>
                      {product}
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              {activeReport && (
                <div className="fl-report-overlay">
                  <small>{dateLabel(value(activeReport, "createdDate"))}</small>
                  <b>{value(activeReport, "activity")}</b>
                  <span>
                    MD {value(activeReport, "mdM") ?? "—"} m · TVD{" "}
                    {value(activeReport, "tvdM") ?? "—"} m
                  </span>
                  <button
                    className="fl-text-button"
                    onClick={() => setSelected(activeReport.id)}
                  >
                    Report details
                  </button>
                </div>
              )}
              {record && tab !== "editor" && !sourceOpen && (
                <aside className="fl-inspector">
                  <div className="fl-sidebar-heading">
                    <span>{record.label}</span>
                    <button
                      aria-label="Close details"
                      onClick={() => setSelected(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <Facts
                    record={record}
                    openSources={openSources}
                    correct={correct}
                  />
                </aside>
              )}
            </div>
            <div className="fl-timeline">
              <button
                aria-label={playing ? "Pause timeline" : "Play timeline"}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button
                className={!report ? "active" : ""}
                onClick={() => {
                  setReport(null);
                  setPlaying(false);
                }}
              >
                All
              </button>
              <div className="fl-timeline-reports">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    title={`${r.label} · ${dateLabel(value(r, "createdDate"))}`}
                    className={report === r.label ? "active" : ""}
                    onClick={() => setReport(r.label)}
                  >
                    <i />
                    <span>{r.label.replace("Report ", "R")}</span>
                  </button>
                ))}
              </div>
              <button
                aria-label={bottomOpen ? "Collapse charts" : "Expand charts"}
                onClick={() => setBottomOpen((o) => !o)}
              >
                {bottomOpen ? (
                  <ChevronDown size={17} />
                ) : (
                  <ChevronUp size={17} />
                )}
              </button>
            </div>
            {bottomOpen && (
              <section className="fl-analytics">
                <Analytics
                  data={data}
                  reports={reports}
                  report={report}
                  product={product}
                  onReport={setReport}
                  onProduct={setProduct}
                />
              </section>
            )}
          </>
        ) : (
          <div className="fl-welcome">
            <div className="fl-orbit">
              <div />
              <div />
              <Layers3 size={48} />
            </div>
            <span className="fl-eyebrow">
              A NEW PERSPECTIVE ON DRILLING FLUIDS
            </span>
            <h1>
              Your well has a story.
              <br />
              <em>See the whole picture.</em>
            </h1>
            <p>
              Turn field reports into an interactive well.
              <br />
              Follow every product, understand every cost,
              <br />
              and ask better questions of your data.
            </p>
            <button
              className="fl-primary"
              disabled={uploading || !!activeJob}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} />{" "}
              {wellId
                ? "Import reports for this well"
                : "Upload your first well"}
            </button>
            <div className="fl-welcome-features">
              <span>
                <Box size={16} />
                3D reconstruction
              </span>
              <span>
                <Activity size={16} />
                Cost intelligence
              </span>
              <span>
                <MessageSquare size={16} />
                AI analyst
              </span>
            </div>
          </div>
        )}
      </section>
      {sourceOpen && (
        <div className="fl-source-overlay">
          <section
            ref={sourcePanel}
            className="fl-source-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Source data and import review"
          >
            <div className="fl-sidebar-heading">
              <span>Source data & import review</span>
              <button
                aria-label="Close source viewer"
                onClick={() => setSourceOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="fl-source-search"
              onSubmit={(e) => {
                e.preventDefault();
                setSourceIds(undefined);
                void sourceFetch(undefined, sourceQuery);
              }}
            >
              <Search size={16} />
              <input
                aria-label="Search source cells"
                placeholder="Search sheet names, values, or cell addresses"
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
              />
              <button>Search all</button>
            </form>
            <div className="fl-source-content">
              {sourceBusy ? (
                <Empty title="Loading source cells…" />
              ) : (
                <>
                  <p className="fl-muted">
                    {sourceTotal} matching cells · originals are retained
                    unchanged
                  </p>
                  {sources.map((s) => (
                    <article className="fl-source-cell" key={s.id}>
                      <div>
                        <b>
                          {s.sheet}!{s.cell}
                        </b>
                        <small>{s.file}</small>
                      </div>
                      <pre>{s.display}</pre>
                      {s.formula && (
                        <small>
                          Source formula (not executed): {s.formula}
                        </small>
                      )}
                    </article>
                  ))}
                  {sourceNext !== null && (
                    <button
                      className="fl-secondary"
                      onClick={() =>
                        void sourceFetch(sourceIds, sourceQuery, sourceNext)
                      }
                    >
                      Next 100 cells
                    </button>
                  )}
                </>
              )}
              <h3>Import review · {data?.issues.length || 0} findings</h3>
              {data?.issues.map((i) => (
                <article className="fl-issue" key={i.id}>
                  <small>{i.code}</small>
                  <p>{i.message}</p>
                  {i.candidate && (
                    <p>
                      Incoming: {i.candidate.value} {i.candidate.unit}
                      <br />
                      Retained: {i.accepted?.value} {i.accepted?.unit}
                    </p>
                  )}
                  <div className="fl-inline">
                    {i.sources.length > 0 && (
                      <button
                        onClick={() => {
                          setSourceIds(i.sources);
                          void sourceFetch(i.sources);
                        }}
                      >
                        View evidence
                      </button>
                    )}
                    {i.recordId && i.field && i.candidate && (
                      <button
                        onClick={() =>
                          void run(() =>
                            correct(
                              i.recordId!,
                              i.field!,
                              i.candidate!.value ?? "",
                            ),
                          )
                        }
                      >
                        Accept incoming value
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {data && (
                <form
                  className="fl-field"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const currency =
                      new FormData(e.currentTarget)
                        .get("currency")
                        ?.toString()
                        .trim()
                        .toUpperCase() || null;
                    void run(async () => {
                      await api.saveWell(data.well, { currency });
                      await refresh();
                    });
                  }}
                >
                  <label htmlFor="fl-currency">
                    Confirm currency for amounts without a currency
                  </label>
                  <div className="fl-inline">
                    <input
                      id="fl-currency"
                      name="currency"
                      maxLength={3}
                      defaultValue={data.currency || ""}
                      placeholder="e.g. CAD"
                    />
                    <button>Save</button>
                  </div>
                  <small>Explicit source currencies remain unchanged.</small>
                </form>
              )}
            </div>
          </section>
        </div>
      )}
      <footer className="fl-status">
        <span>
          <i /> PRIVATE WORKSPACE
        </span>
        <span>
          {data
            ? `${data.records.length} records · ${data.coverage.populated} source cells`
            : "AI-assisted extraction · source-backed analysis"}
        </span>
        <span>
          {data?.summary.currencies.some((c) => c.currency === "unspecified")
            ? "Currency unconfirmed"
            : "UniqEnergy"}
        </span>
      </footer>
    </main>
  );
}
