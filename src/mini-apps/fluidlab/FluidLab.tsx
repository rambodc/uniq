import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, X, Box } from "lucide-react";
import * as api from "./api";
import { Costs, Mud, Chat, Facts } from "./Panels";
import {
  reportRecords,
  type Dataset,
  type ImportJob,
  type Source,
  type Well,
} from "./model";
import "./fluidlab.css";
const WellScene = lazy(() => import("./WellScene"));
const active = (job: ImportJob | null) =>
  !!job && ["uploading", "queued", "processing"].includes(job.status);
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
function Dialog({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ) || [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="fl-overlay">
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={wide ? "fl-dialog fl-wide" : "fl-dialog"}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={close} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export default function FluidLab({
  wellId,
  navigate,
}: {
  wellId?: string;
  navigate: (url: string) => void;
}) {
  const [wells, setWells] = useState<Well[]>([]),
    [data, setData] = useState<Dataset | null>(null),
    [tab, setTab] = useState("costs"),
    [report, setReport] = useState<string | null>(null),
    [product, setProduct] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [percent, setPercent] = useState(0),
    [manage, setManage] = useState(false),
    [history, setHistory] = useState<ImportJob[]>([]),
    [job, setJob] = useState<ImportJob | null>(null),
    [sourceOpen, setSourceOpen] = useState(false),
    [sources, setSources] = useState<Source[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [showWell, setShowWell] = useState(false),
    [view, setView] = useState("isometric"),
    [fit, setFit] = useState(0),
    [capture, setCapture] = useState(0),
    [highlights, setHighlights] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const list = useCallback(async () => setWells(await api.listWells()), []);
  const refresh = useCallback(async () => {
    if (!wellId) return;
    const [d, h] = await Promise.all([
      api.getWell(wellId),
      api.getHistory(wellId),
    ]);
    setData(d);
    setHistory(h.imports);
    return d;
  }, [wellId]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void api
      .listWells()
      .then(setWells)
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      setData(null);
      setReport(null);
      setProduct(null);
      setJob(null);
      setTab("costs");
      setShowWell(false);
      setHistory([]);
      setSelected(null);
      setSourceOpen(false);
      if (!wellId) return;
      setLoading(true);
      void Promise.all([api.getWell(wellId), api.getHistory(wellId)])
        .then(([d, h]) => {
          if (alive) {
            setData(d);
            setHistory(h.imports);
            setJob(h.imports.find((j) => active(j)) || null);
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
    if (!jobId || !["queued", "processing"].includes(jobStatus || "")) return;
    let alive = true;
    const id = jobId;
    const timer = setInterval(() => {
      void api
        .getImport(id)
        .then(async (next) => {
          if (!alive) return;
          setJob(next);
          if (!active(next)) {
            await refresh();
            await list();
          }
        })
        .catch((e) => {
          if (alive) setError(message(e));
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
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setPercent(0);
    try {
      await run(async () => {
        let id = wellId;
        if (!id) {
          const w = await api.createWell(
            files[0].name.replace(/\.[^.]+$/, ""),
            true,
          );
          id = w.id;
          await list();
          navigate(`/apps/fluidlab/wells/${id}`);
        }
        const j = await api.uploadFiles(id, files, setPercent, setJob);
        setJob({ ...j, status: "queued" });
        if (id === wellId) await refresh();
      });
    } finally {
      setUploading(false);
    }
  };
  const openSources = async (ids: string[]) => {
    setSourceOpen(true);
    try {
      const s = await api.getSources(wellId!, data?.well.version || null, ids);
      setSources(s.sources);
    } catch (e) {
      setError(message(e));
    }
  };
  const select = (id: string) => {
    setSelected(id);
    setSources([]);
    setSourceOpen(true);
  };
  const closeSource = useCallback(() => setSourceOpen(false), []),
    closeWell = useCallback(() => setShowWell(false), []);
  const record = data?.records.find((r) => r.id === selected),
    reports = data ? reportRecords(data) : [];
  return (
    <div className="fluidlab-app">
      <header className="fl-header">
        <Link to="/portal" aria-label="Back to portal">
          <ArrowLeft size={19} />
        </Link>
        <strong>FluidLab</strong>
        <select
          aria-label="Choose well"
          value={wellId || ""}
          onChange={(e) =>
            navigate(
              e.target.value
                ? `/apps/fluidlab/wells/${e.target.value}`
                : "/apps/fluidlab",
            )
          }
        >
          <option value="">Choose a well</option>
          {wells.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <button onClick={() => setManage((v) => !v)} aria-expanded={manage}>
          Manage wells
        </button>
        <button
          className="fl-primary"
          disabled={busy || uploading || active(job)}
          onClick={() => file.current?.click()}
        >
          <Upload size={16} />
          Import data
        </button>
        {data && (
          <button onClick={() => setShowWell(true)}>
            <Box size={16} />
            View well
          </button>
        )}
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
      </header>
      {error && (
        <div className="fl-error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {manage && (
        <section className="fl-manage" aria-label="Well management">
          <div className="fl-toolbar">
            <button
              disabled={busy}
              onClick={() => {
                const name = window.prompt("New well name");
                if (name)
                  void run(async () => {
                    const w = await api.createWell(name);
                    await list();
                    navigate(`/apps/fluidlab/wells/${w.id}`);
                    setManage(false);
                  });
              }}
            >
              New well
            </button>
            {data && (
              <>
                <button
                  onClick={() => {
                    const name = window.prompt("Well name", data.well.name);
                    if (name)
                      void run(async () => {
                        await api.renameWell(data.well, name);
                        await refresh();
                        await list();
                      });
                  }}
                >
                  Rename
                </button>
                <button
                  disabled={active(job) || busy}
                  onClick={() => {
                    if (
                      window.confirm("Delete this well and its uploaded files?")
                    )
                      void run(async () => {
                        await api.deleteWell(data.well.id);
                        await list();
                        navigate("/apps/fluidlab");
                      });
                  }}
                >
                  Delete well
                </button>
              </>
            )}
          </div>
          <details>
            <summary>Import history · {history.length}</summary>
            {history.map((j) => (
              <div className="fl-history" key={j.id}>
                <span>
                  {j.kind === "geometry"
                    ? "Optional 3D"
                    : j.files.map((f) => f.name).join(", ")}{" "}
                  · {j.status}
                </span>
                <small>{j.message}</small>
                {["failed", "partial", "cancelled"].includes(j.status) && (
                  <button
                    disabled={active(job) || busy}
                    onClick={() =>
                      void run(async () => {
                        await api.retryImport(j.id);
                        setJob({ ...j, status: "queued" });
                      })
                    }
                  >
                    Resume saved progress
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
                    Finish uploaded import
                  </button>
                )}
              </div>
            ))}
          </details>
        </section>
      )}
      {(uploading || job) && (
        <section className="fl-job" role="status">
          <div>
            <b>
              {uploading
                ? `Uploading ${percent}%`
                : job?.status === "partial"
                  ? "Ready · review flags"
                  : job?.status}
            </b>
            <span>{job?.message}</span>
            {job?.status === "processing" && (
              <small>
                Safe to leave this page. Last progress:{" "}
                {job.updatedAt
                  ? new Date(job.updatedAt).toLocaleTimeString()
                  : "just now"}
              </small>
            )}
            {job?.status === "cancelled" && (
              <small>
                Use Manage wells to resume, or delete and upload again to start
                fresh.
              </small>
            )}
          </div>
          {job && active(job) && !uploading && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.cancelImport(job.id);
                  setJob({
                    ...job,
                    status: "cancelled",
                    message: "Import cancelled",
                  });
                  await refresh();
                })
              }
            >
              Cancel import
            </button>
          )}
          {job && !active(job) && (
            <button
              aria-label="Dismiss import status"
              onClick={() => setJob(null)}
            >
              <X size={16} />
            </button>
          )}
        </section>
      )}
      <main className="fl-main">
        {loading ? (
          <p>Loading well…</p>
        ) : !data?.records.length ? (
          <section className="fl-welcome">
            <span className="fl-eyebrow">DRILLING FLUIDS, MADE CLEAR</span>
            <h1>
              Your reports.
              <br />A clearer picture.
            </h1>
            <p>
              Upload spreadsheets to explore costs, mud properties, and
              questions about your well. Detailed 3D is optional.
            </p>
            <button
              className="fl-primary"
              disabled={uploading || active(job)}
              onClick={() => file.current?.click()}
            >
              Upload spreadsheets
            </button>
            <small>XLSX, XLS, CSV or TSV · up to 5 files</small>
          </section>
        ) : (
          <>
            <div className="fl-workspace-bar">
              <nav aria-label="FluidLab sections">
                {[
                  ["costs", "Costs"],
                  ["mud", "Mud"],
                  ["chat", "Chat"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-label={label}
                    aria-current={tab === id ? "page" : undefined}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="fl-filters">
                <label>
                  Report{" "}
                  <select
                    aria-label="Report"
                    value={report || ""}
                    onChange={(e) => setReport(e.target.value || null)}
                  >
                    <option value="">Whole well</option>
                    {reports.map((r) => (
                      <option key={r.id} value={r.label}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product{" "}
                  <select
                    aria-label="Product"
                    value={product || ""}
                    onChange={(e) => setProduct(e.target.value || null)}
                  >
                    <option value="">All products</option>
                    {data.records
                      .filter((r) => r.kind === "product")
                      .map((r) => (
                        <option key={r.id}>{r.label}</option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            {data.issues.length > 0 && (
              <details className="fl-flags">
                <summary>
                  {data.issues.length} items to review · unclear values stay
                  flagged
                </summary>
                {data.issues.map((i) => (
                  <p key={i.id}>
                    {i.message}
                    {i.sources.length > 0 && (
                      <button
                        onClick={() => {
                          setSelected(i.recordId);
                          void openSources(i.sources);
                        }}
                      >
                        Source
                      </button>
                    )}
                  </p>
                ))}
              </details>
            )}
            {tab === "costs" ? (
              <Costs
                data={data}
                report={report}
                product={product}
                select={select}
                onReport={setReport}
              />
            ) : tab === "mud" ? (
              <Mud
                data={data}
                report={report}
                select={select}
                onReport={setReport}
              />
            ) : (
              <Chat
                data={data}
                report={report}
                product={product}
                openSources={(ids) => void openSources(ids)}
                highlight={(ids) => {
                  setHighlights(ids);
                  if (data.geometry.length) setShowWell(true);
                  else if (ids[0]) select(ids[0]);
                }}
              />
            )}
          </>
        )}
      </main>
      {sourceOpen && data && (
        <Dialog title={record?.label || "Source details"} close={closeSource}>
          {record && (
            <Facts
              record={record}
              openSources={(ids) => void openSources(ids)}
              correct={(recordId, field, value) =>
                run(async () => {
                  await api.saveWell(data.well, {
                    correction: { recordId, field, value },
                  });
                  await refresh();
                })
              }
            />
          )}
          <form
            className="fl-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              const currency = String(
                new FormData(e.currentTarget).get("currency") || "",
              )
                .trim()
                .toUpperCase();
              void run(async () => {
                await api.saveWell(data.well, { currency: currency || null });
                await refresh();
              });
            }}
          >
            <label>
              Confirm currency{" "}
              <input
                name="currency"
                aria-label="Currency"
                maxLength={3}
                placeholder="Unknown"
                defaultValue={data.currency || ""}
              />
            </label>
            <button disabled={busy}>Save currency</button>
          </form>
          {sources.map((s) => (
            <article key={s.id} className="fl-source">
              <small>
                {s.file} · {s.sheet}!{s.cell}
              </small>
              <pre>{s.display}</pre>
              {s.formula && (
                <small>Original formula: {s.formula} (not executed)</small>
              )}
            </article>
          ))}
        </Dialog>
      )}
      {showWell && data && (
        <Dialog title="Well view" close={closeWell} wide>
          {data.geometry.length ? (
            <>
              <div className="fl-toolbar">
                <span className="fl-muted">
                  Schematic where survey data is unavailable
                </span>
                {["isometric", "top", "side"].map((v) => (
                  <button key={v} onClick={() => setView(v)}>
                    {v}
                  </button>
                ))}
                <button onClick={() => setFit((v) => v + 1)}>Fit</button>
                <button onClick={() => setCapture((v) => v + 1)}>
                  Download PNG
                </button>
              </div>
              <div className="fl-scene">
                <Suspense fallback={<p>Loading 3D…</p>}>
                  <WellScene
                    data={data}
                    branches={data.geometry}
                    selected={selected}
                    highlights={highlights}
                    select={setSelected}
                    mode="losses"
                    report={report}
                    product={product}
                    view={view}
                    fit={fit}
                    capture={capture}
                  />
                </Suspense>
              </div>
            </>
          ) : (
            <div className="fl-welcome">
              <h2>Build a detailed well view</h2>
              <p>
                This optional AI step reads documented legs. Your costs, mud
                data, and chat are already available.
              </p>
              <button
                className="fl-primary"
                disabled={busy || active(job) || !data.well.version}
                onClick={() =>
                  void run(async () => {
                    setJob(await api.generateGeometry(data.well));
                    await refresh();
                  })
                }
              >
                {job?.kind === "geometry" && active(job)
                  ? "Generating 3D…"
                  : "Generate detailed 3D"}
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
