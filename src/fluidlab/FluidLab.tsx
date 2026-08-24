/* eslint-disable react-hooks/set-state-in-effect,react-hooks/preserve-manual-memoization,jsx-a11y/click-events-have-key-events,jsx-a11y/no-noninteractive-element-interactions,jsx-a11y/interactive-supports-focus */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useReducedMotion } from "motion/react";
import {
  FileDown,
  FileUp,
  FolderOpen,
  History,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { auth, ensureFluidLabIdentity } from "../firebaseClient";
import {
  analyzeWellFile,
  getProfile,
  refineWellDraft,
  type AIExtractionResult,
  type FluidLabProfile,
  type QuotaStatus,
} from "./ai";
import {
  addIntermediateSection,
  createProject as createBlank,
  cubicMetresToBbl,
  deleteIntermediateSection,
  generateProject,
  insertSurveyStation,
  isBoundaryStation,
  parseProjectJson,
  projectFileName,
  sectionAtMd,
  sectionStartMd,
  type HoleSection,
  type SurveyStation,
  type UnitSystem,
  type WellProject,
} from "./engineering";
import {
  GUEST_DRAFT_KEY,
  PENDING_SAVE_KEY,
  localDelete,
  localGet,
  localSet,
  type LocalDraft,
} from "./persistence";
import {
  createProject,
  createVersion,
  getProject,
  updateProject,
  versionAction,
  type ProjectVersion,
} from "./projects";
import "./fluidlab.css";
const Scene = lazy(() => import("./WellboreScene"));
type SaveState =
  | "editing"
  | "device"
  | "saving"
  | "saved"
  | "offline"
  | "failed"
  | "invalid";
const toLength = (m: number, u: UnitSystem) =>
    u === "metric" ? m : m * 3.280839895,
  fromLength = (v: number, u: UnitSystem) =>
    u === "metric" ? v : v / 3.280839895,
  toDiameter = (mm: number, u: UnitSystem) => (u === "metric" ? mm : mm / 25.4),
  fromDiameter = (v: number, u: UnitSystem) => (u === "metric" ? v : v * 25.4),
  lunit = (u: UnitSystem) => (u === "metric" ? "m" : "ft"),
  dunit = (u: UnitSystem) => (u === "metric" ? "mm" : "in");
function Field({
  label,
  value,
  unit,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          disabled={disabled}
          type="number"
          value={Number.isInteger(value) ? value : Number(value.toFixed(3))}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="exit-overlay">
      <section className="exit-dialog" role="dialog" aria-modal="true">
        {children}
      </section>
    </div>
  );
}
function aiProject(result: AIExtractionResult, current: WellProject) {
  const draft = result.draft,
    source = draft.units.value ?? current.unitSystem,
    next = createBlank(current.unitSystem);
  next.name = draft.name.value ?? current.name;
  next.classification = draft.classification.value ?? current.classification;
  const usableSections = draft.holeSections.filter(
    (s) => s.endMd != null && s.diameter != null,
  );
  if (usableSections.length >= 2) {
    const stations: SurveyStation[] = [
        { id: crypto.randomUUID(), mdM: 0, inclinationDeg: 0, azimuthDeg: 0 },
      ],
      sections: HoleSection[] = [];
    usableSections.forEach((item, index) => {
      const survey = draft.surveyStations.find((s) => s.md === item.endMd),
        end: SurveyStation = {
          id: crypto.randomUUID(),
          mdM: fromLength(item.endMd!, source),
          inclinationDeg: survey?.inclination ?? 0,
          azimuthDeg: survey?.azimuth ?? 0,
        };
      stations.push(end);
      sections.push({
        id: crypto.randomUUID(),
        category:
          index === 0
            ? "surface"
            : index === usableSections.length - 1
              ? "main"
              : "intermediate",
        name: item.name,
        diameterMm: fromDiameter(item.diameter!, source),
        endStationId: end.id,
        color: ["#35dfbd", "#43aee8", "#8a73e8", "#f2b84b"][index % 4],
        visible: true,
      });
    });
    draft.surveyStations
      .filter(
        (s) =>
          s.md != null &&
          s.inclination != null &&
          s.azimuth != null &&
          !usableSections.some((section) => section.endMd === s.md) &&
          s.md! > 0 &&
          s.md! < usableSections.at(-1)!.endMd!,
      )
      .forEach((s) =>
        stations.push({
          id: crypto.randomUUID(),
          mdM: fromLength(s.md!, source),
          inclinationDeg: s.inclination!,
          azimuthDeg: s.azimuth!,
        }),
      );
    stations.sort((a, b) => a.mdM - b.mdM);
    next.holeSections = sections;
    next.surveyStations = stations;
    next.display.selectedSectionId = sections[0].id;
    next.display.selectedStationId = stations[1].id;
  }
  return next;
}
export default function FluidLab({
  onHome,
  onAuth,
  onDirtyChange,
  exitRequest,
  onConfirmBrowserExit,
}: {
  onHome: (section?: string) => void;
  onAuth: (path: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  exitRequest: number;
  onConfirmBrowserExit: () => void;
}) {
  const initial = createBlank(),
    [design, setDesign] = useState(initial),
    [rendered, setRendered] = useState(initial),
    [setup, setSetup] = useState(
      () => !new URLSearchParams(location.search).get("project"),
    ),
    [projectId, setProjectId] = useState(() =>
      new URLSearchParams(location.search).get("project"),
    ),
    [saveState, setSaveState] = useState<SaveState>("editing"),
    [panelCollapsed, setPanelCollapsed] = useState(false),
    [view, setView] = useState<"overview" | "side" | "top">("overview"),
    [reset, setReset] = useState(0),
    [visible, setVisible] = useState(!document.hidden),
    [notice, setNotice] = useState(""),
    [saveDialog, setSaveDialog] = useState(false),
    [exitOpen, setExitOpen] = useState(false),
    [conflict, setConflict] = useState(false),
    [versionsOpen, setVersionsOpen] = useState(false),
    [versions, setVersions] = useState<ProjectVersion[]>([]),
    [versionName, setVersionName] = useState(""),
    [versionNote, setVersionNote] = useState(""),
    [handoff, setHandoff] = useState<WellProject | null>(null),
    [storageReady, setStorageReady] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<FluidLabProfile | null>(null),
    [quota, setQuota] = useState<QuotaStatus | null>(null),
    [authReady, setAuthReady] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [analysis, setAnalysis] = useState<AIExtractionResult | null>(null),
    [message, setMessage] = useState(""),
    [working, setWorking] = useState(false),
    [aiError, setAiError] = useState("");
  const revisionRef = useRef(0),
    syncedRef = useRef(""),
    savingRef = useRef(false),
    queuedRef = useRef<WellProject | null>(null),
    account = Boolean(user && !user.isAnonymous),
    generated = useMemo(() => generateProject(design), [design]),
    dirty = ["editing", "offline", "failed", "invalid"].includes(saveState),
    reduced = Boolean(useReducedMotion()),
    units = design.unitSystem,
    edit = (recipe: (next: WellProject) => void) => {
      const next = structuredClone(design);
      recipe(next);
      setDesign(next);
      setSaveState("editing");
    };
  const pumpSave = useCallback(async () => {
    if (savingRef.current || !projectId) return;
    const next = queuedRef.current;
    if (!next) return;
    queuedRef.current = null;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const saved = await updateProject(
        projectId,
        next,
        revisionRef.current,
        crypto.randomUUID(),
      );
      revisionRef.current = saved.revision;
      syncedRef.current = JSON.stringify(next);
      setSaveState("saved");
    } catch (error) {
      if (String((error as { code?: string }).code).includes("aborted")) {
        setConflict(true);
        setSaveState("failed");
      } else {
        queuedRef.current = next;
        setSaveState(navigator.onLine ? "failed" : "offline");
      }
    } finally {
      savingRef.current = false;
      if (queuedRef.current) void pumpSave();
    }
  }, [projectId]);
  useEffect(
    () =>
      onAuthStateChanged(auth, (acct) => {
        setUser(acct);
        setProfile(null);
        if (!acct) {
          void ensureFluidLabIdentity().catch(() => setAuthReady(true));
          return;
        }
        if (acct.isAnonymous) {
          setQuota({
            analysesRemaining: 1,
            refinementsRemaining: 3,
            resetsAt: "",
          });
          setAuthReady(true);
          return;
        }
        void getProfile()
          .then((r) => {
            setProfile(r.profile);
            setQuota(r.quota);
          })
          .finally(() => setAuthReady(true));
      }),
    [],
  );
  useEffect(() => {
    if (projectId) {
      setStorageReady(true);
      return;
    }
    void localGet<LocalDraft>(GUEST_DRAFT_KEY)
      .then((d) => {
        if (d && parseProjectJson(JSON.stringify(d.design))) {
          setDesign(d.design);
          setRendered(d.design);
          setSetup(false);
          setSaveState("device");
          setNotice("Recovered on this device.");
        }
      })
      .finally(() => setStorageReady(true));
  }, [projectId]);
  useEffect(() => {
    if (!account || !projectId) return;
    void getProject(projectId)
      .then((r) => {
        const d = parseProjectJson(JSON.stringify(r.project.design));
        if (!d) throw Error();
        setDesign(d);
        setRendered(d);
        revisionRef.current = r.project.revision;
        syncedRef.current = JSON.stringify(d);
        setVersions(r.versions);
        setSetup(false);
        setSaveState("saved");
      })
      .catch(() =>
        setNotice("This project is not in the current survey format."),
      );
  }, [account, projectId]);
  useEffect(() => {
    if (!account) return;
    void localGet<{ design: WellProject; intent: "signup" | "signin" }>(
      PENDING_SAVE_KEY,
    ).then(async (p) => {
      if (!p) return;
      if (p.intent === "signup") {
        const saved = await createProject(p.design);
        setProjectId(saved.id);
        revisionRef.current = saved.revision;
        setDesign(p.design);
        setRendered(p.design);
        history.replaceState({}, "", `/fluidlab?project=${saved.id}`);
        await localDelete(PENDING_SAVE_KEY);
        await localDelete(GUEST_DRAFT_KEY);
        setSaveState("saved");
      } else setHandoff(p.design);
    });
  }, [account]);
  useEffect(() => {
    if (!storageReady) return;
    const timer = setTimeout(() => {
      if (generated.errors.length) {
        setSaveState("invalid");
        return;
      }
      setRendered(structuredClone(design));
      if (!account)
        void localSet(GUEST_DRAFT_KEY, {
          design,
          updatedAt: new Date().toISOString(),
        })
          .then(() => setSaveState("device"))
          .catch(() => setSaveState("failed"));
      else if (projectId && JSON.stringify(design) !== syncedRef.current) {
        queuedRef.current = structuredClone(design);
        void pumpSave();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [
    design,
    generated.errors.length,
    account,
    projectId,
    storageReady,
    pumpSave,
  ]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("beforeunload", fn);
    return () => removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    if (exitRequest) setExitOpen(true);
  }, [exitRequest]);
  useEffect(() => {
    const fn = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, []);
  const saveCloud = async () => {
      if (!account) {
        setSaveDialog(true);
        return;
      }
      if (projectId) return;
      const saved = await createProject(design);
      setProjectId(saved.id);
      revisionRef.current = saved.revision;
      syncedRef.current = JSON.stringify(design);
      history.replaceState({}, "", `/fluidlab?project=${saved.id}`);
      await localDelete(GUEST_DRAFT_KEY);
      setSaveState("saved");
    },
    authSave = async (intent: "signup" | "signin") => {
      await localSet(PENDING_SAVE_KEY, { design, intent });
      onAuth(`/${intent}?returnTo=/fluidlab`);
    },
    download = () => {
      const a = document.createElement("a"),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(design, null, 2)], {
            type: "application/json",
          }),
        );
      a.download = projectFileName(design.name);
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    openFile = async (file?: File) => {
      if (!file) return;
      const parsed = parseProjectJson(await file.text());
      if (!parsed) {
        setNotice(
          "Only the current directional-survey project format is supported.",
        );
        return;
      }
      setProjectId(null);
      history.replaceState({}, "", "/fluidlab");
      setDesign(parsed);
      setRendered(parsed);
      setSetup(false);
    },
    analyze = async () => {
      if (!file) return;
      setWorking(true);
      setAiError("");
      try {
        const result = await analyzeWellFile(file);
        setAnalysis(result);
        setQuota(result.quota);
        setDesign(aiProject(result, design));
      } catch (error) {
        setAiError(
          error instanceof Error
            ? error.message
            : "Analysis failed; no quota was consumed.",
        );
      } finally {
        setWorking(false);
      }
    },
    refine = async () => {
      if (!analysis || !message.trim()) return;
      setWorking(true);
      try {
        const result = await refineWellDraft(analysis.draft, message);
        setAnalysis(result);
        setQuota(result.quota);
        setDesign(aiProject(result, design));
        setMessage("");
      } finally {
        setWorking(false);
      }
    },
    finishExit = () => {
      onDirtyChange(false);
      if (exitRequest) onConfirmBrowserExit();
      else onHome();
    };
  const updateSection = (
      index: number,
      recipe: (section: HoleSection, next: WellProject) => void,
    ) => edit((next) => recipe(next.holeSections[index], next)),
    updateStation = (id: string, recipe: (station: SurveyStation) => void) =>
      edit((next) => {
        const station = next.surveyStations.find((s) => s.id === id);
        if (station) recipe(station);
        next.surveyStations.sort((a, b) => a.mdM - b.mdM);
      });
  return (
    <main
      className={`fluidlab-workspace ${panelCollapsed ? "panel-collapsed" : ""}`}
    >
      <div className="workspace-scene">
        <Suspense
          fallback={<div className="scene-loading">Calculating survey…</div>}
        >
          <Scene
            design={rendered}
            reducedMotion={reduced}
            lowPower={innerWidth < 760}
            active={visible}
            view={view}
            reset={reset}
            onCanvas={() => {}}
            onContextLost={() => {
              setNotice("3-D context recovered.");
              setReset((v) => v + 1);
            }}
            onSelect={(kind, id) =>
              edit((next) => {
                if (kind === "section") next.display.selectedSectionId = id;
                else next.display.selectedStationId = id;
              })
            }
          />
        </Suspense>
      </div>
      <header className="workspace-topbar">
        <button
          className="workspace-brand"
          onClick={() => (dirty ? setExitOpen(true) : onHome())}
        >
          <i />
          Uniq<strong>Energy</strong>
          <span>/ FluidLab</span>
        </button>
        <div className="workspace-title">
          <input
            value={design.name}
            onChange={(e) => edit((n) => (n.name = e.target.value))}
          />
          <small>
            Minimum curvature · {units} · {design.azimuthReference} north
          </small>
        </div>
        <div className="workspace-status" aria-live="polite">
          <span className={saveState}>
            {saveState === "device"
              ? "On this device"
              : saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : saveState === "invalid"
                    ? "Invalid changes—not stored"
                    : saveState === "offline"
                      ? "Offline—changes pending"
                      : saveState === "failed"
                        ? "Save failed"
                        : "Editing"}
          </span>
          <button
            disabled={Boolean(generated.errors.length)}
            onClick={() => void saveCloud()}
          >
            <Save /> Save
          </button>
          {account && (
            <button onClick={() => onAuth("/fluidlab/projects")}>
              <FolderOpen /> Projects
            </button>
          )}
          <label className="topbar-file">
            <FileUp /> Open
            <input
              type="file"
              accept=".json"
              onChange={(e) => void openFile(e.target.files?.[0])}
            />
          </label>
          <button onClick={download}>
            <FileDown /> JSON
          </button>
          {account && projectId && (
            <button onClick={() => setVersionsOpen(true)}>
              <History /> Versions
            </button>
          )}
          <button title="Sign out" onClick={() => void signOut(auth)}>
            <LogOut />
          </button>
        </div>
      </header>
      <aside className="workspace-panel survey-panel">
        <div className="panel-heading">
          <div>
            <span>Directional survey builder</span>
            <strong>
              {design.holeSections.length} sections ·{" "}
              {design.surveyStations.length} stations
            </strong>
          </div>
          <button onClick={() => setPanelCollapsed((v) => !v)}>
            {panelCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
        </div>
        <div className="panel-body editor-content">
          <div className="workflow-intro">
            <b>1. Define hole sections</b>
            <p>
              Section boundaries are mandatory survey stations. TVD and position
              are calculated.
            </p>
          </div>
          <label className="text-field">
            <span>Azimuth reference</span>
            <select
              value={design.azimuthReference}
              onChange={(e) =>
                edit(
                  (n) =>
                    (n.azimuthReference = e.target
                      .value as WellProject["azimuthReference"]),
                )
              }
            >
              <option value="true">True north</option>
              <option value="grid">Grid north</option>
              <option value="magnetic">Magnetic north</option>
            </select>
          </label>
          {design.holeSections.map((section, index) => {
            const d = generated.sections[index],
              end = design.surveyStations.find(
                (s) => s.id === section.endStationId,
              )!;
            return (
              <fieldset
                className={`design-card ${design.display.selectedSectionId === section.id ? "selected" : ""}`}
                key={section.id}
                onClick={() =>
                  edit((n) => (n.display.selectedSectionId = section.id))
                }
              >
                <legend>
                  <span>{index + 1}</span>
                  <input
                    value={section.name}
                    onChange={(e) =>
                      updateSection(index, (s) => (s.name = e.target.value))
                    }
                  />
                  {section.category === "intermediate" && (
                    <button
                      aria-label={`Delete ${section.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        edit((n) => deleteIntermediateSection(n, section.id));
                      }}
                    >
                      <Trash2 />
                    </button>
                  )}
                </legend>
                <small className="section-kind">{section.category}</small>
                <div className="control-grid">
                  <Field
                    label="Start MD"
                    value={toLength(sectionStartMd(design, index), units)}
                    unit={lunit(units)}
                    onChange={() => {}}
                    disabled
                  />
                  <Field
                    label="End MD"
                    value={toLength(end?.mdM ?? 0, units)}
                    unit={lunit(units)}
                    min={0}
                    onChange={(v) =>
                      updateSection(index, (_, next) => {
                        const station = next.surveyStations.find(
                          (s) => s.id === section.endStationId,
                        );
                        if (station) station.mdM = fromLength(v, units);
                        next.surveyStations.sort((a, b) => a.mdM - b.mdM);
                      })
                    }
                  />
                  <Field
                    label="Hole diameter"
                    value={toDiameter(section.diameterMm, units)}
                    unit={dunit(units)}
                    step={0.1}
                    onChange={(v) =>
                      updateSection(
                        index,
                        (s) => (s.diameterMm = fromDiameter(v, units)),
                      )
                    }
                  />
                </div>
                {d && (
                  <div className="section-summary">
                    <span>
                      TVD {toLength(d.startTvdM, units).toFixed(1)} →{" "}
                      {toLength(d.endTvdM, units).toFixed(1)} {lunit(units)}
                    </span>
                    <strong>
                      {units === "metric"
                        ? `${d.capacityM3.toFixed(2)} m³`
                        : `${cubicMetresToBbl(d.capacityM3).toFixed(2)} bbl`}
                    </strong>
                  </div>
                )}
              </fieldset>
            );
          })}
          <button
            className="add-row"
            onClick={() =>
              edit((n) => {
                const id = addIntermediateSection(n);
                n.display.selectedSectionId = id;
              })
            }
          >
            <Plus /> Add Intermediate section
          </button>
          <div className="workflow-intro">
            <b>2. Enter survey stations</b>
            <p>
              Inclination is from vertical. Azimuth is clockwise from{" "}
              {design.azimuthReference} north.
            </p>
          </div>
          <div className="survey-table" role="table">
            <div className="survey-head" role="row">
              <span># / MD</span>
              <span>Inc / Az</span>
              <span>TVD / N / E</span>
              <span>DLS</span>
            </div>
            {design.surveyStations.map((station, index) => {
              const calc = generated.stations.find((s) => s.id === station.id),
                boundary = isBoundaryStation(design, station.id),
                owner = sectionAtMd(design, station.mdM);
              return (
                <div
                  key={station.id}
                  className={`survey-row ${design.display.selectedStationId === station.id ? "selected" : ""}`}
                  onClick={() =>
                    edit((n) => (n.display.selectedStationId = station.id))
                  }
                  role="row"
                >
                  <div>
                    <b>
                      {index + 1}
                      {boundary && <em> boundary</em>}
                    </b>
                    <Field
                      label="MD"
                      value={toLength(station.mdM, units)}
                      unit={lunit(units)}
                      disabled={index === 0 || boundary}
                      onChange={(v) =>
                        updateStation(
                          station.id,
                          (s) => (s.mdM = fromLength(v, units)),
                        )
                      }
                    />
                    <small>{owner?.name ?? "Origin"}</small>
                  </div>
                  <div>
                    <Field
                      label="Inclination"
                      value={station.inclinationDeg}
                      unit="°"
                      max={180}
                      step={0.1}
                      disabled={index === 0}
                      onChange={(v) =>
                        updateStation(station.id, (s) => (s.inclinationDeg = v))
                      }
                    />
                    <Field
                      label="Azimuth"
                      value={station.azimuthDeg}
                      unit="°"
                      max={359.999}
                      step={0.1}
                      disabled={index === 0}
                      onChange={(v) =>
                        updateStation(station.id, (s) => (s.azimuthDeg = v))
                      }
                    />
                  </div>
                  <div className="survey-derived">
                    <span>
                      TVD <b>{toLength(calc?.tvdM ?? 0, units).toFixed(1)}</b>
                    </span>
                    <span>
                      N{" "}
                      <b>{toLength(calc?.northingM ?? 0, units).toFixed(1)}</b>
                    </span>
                    <span>
                      E <b>{toLength(calc?.eastingM ?? 0, units).toFixed(1)}</b>
                    </span>
                  </div>
                  <div className="survey-actions">
                    <b>
                      {(
                        (calc?.dlsDegPer30m ?? 0) *
                        (units === "metric" ? 1 : 1.016)
                      ).toFixed(2)}
                      °/{units === "metric" ? "30m" : "100ft"}
                    </b>
                    {index > 0 && !boundary && (
                      <button
                        aria-label="Delete survey station"
                        onClick={(e) => {
                          e.stopPropagation();
                          edit(
                            (n) =>
                              (n.surveyStations = n.surveyStations.filter(
                                (s) => s.id !== station.id,
                              )),
                          );
                        }}
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                  {index < design.surveyStations.length - 1 && (
                    <button
                      className="insert-station"
                      onClick={(e) => {
                        e.stopPropagation();
                        edit((n) => {
                          const id = insertSurveyStation(n, station.id);
                          n.display.selectedStationId = id;
                        });
                      }}
                    >
                      <Plus /> Insert station
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <section className="total-capacity">
            <span>Total MD</span>
            <strong>
              {toLength(generated.stations.at(-1)?.mdM ?? 0, units).toFixed(0)}{" "}
              {lunit(units)}
            </strong>
            <span>Total TVD</span>
            <strong>
              {toLength(generated.stations.at(-1)?.tvdM ?? 0, units).toFixed(1)}{" "}
              {lunit(units)}
            </strong>
            <span>Open-hole capacity</span>
            <strong>
              {units === "metric"
                ? `${generated.totalCapacityM3.toFixed(2)} m³`
                : `${cubicMetresToBbl(generated.totalCapacityM3).toFixed(2)} bbl`}
            </strong>
          </section>
          {generated.errors.length > 0 && (
            <div className="validation-box" role="alert">
              <b>3-D paused at last valid values</b>
              <ul>
                {generated.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <section className="ai-workflow">
            <h2>Extract sections and surveys</h2>
            {!authReady ? (
              <p>Starting secure session…</p>
            ) : (
              <>
                <div className="account-row">
                  <span>
                    <b>
                      {profile
                        ? `${profile.firstName} ${profile.lastName}`
                        : "Guest AI trial"}
                    </b>
                    {quota && (
                      <small>
                        {quota.analysesRemaining} analyses ·{" "}
                        {quota.refinementsRemaining} corrections
                      </small>
                    )}
                  </span>
                  {account ? (
                    <button onClick={() => void signOut(auth)}>
                      <LogOut />
                    </button>
                  ) : (
                    <button onClick={() => void authSave("signin")}>
                      <LogIn />
                    </button>
                  )}
                </div>
                <label className="upload-zone">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.csv,.xlsx"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <FileUp />
                  <strong>{file?.name ?? "Choose a well program"}</strong>
                </label>
                <button
                  className="ai-primary"
                  disabled={!file || working}
                  onClick={() => void analyze()}
                >
                  {working ? "Analyzing…" : "Extract survey"}
                </button>
                {analysis && (
                  <div className="chat-compose">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <button onClick={() => void refine()}>Send</button>
                  </div>
                )}
                {aiError && <div className="validation-box">{aiError}</div>}
              </>
            )}
          </section>
        </div>
      </aside>
      <div className="camera-toolbar">
        {(["overview", "side", "top"] as const).map((item) => (
          <button
            className={view === item ? "active" : ""}
            key={item}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
        <button onClick={() => setReset((v) => v + 1)}>
          <RotateCcw />
          <span>Reset</span>
        </button>
      </div>
      {notice && (
        <div className="workspace-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {setup && (
        <Modal>
          <h2>Choose project units</h2>
          <p>This choice is locked. Geometry is stored canonically in SI.</p>
          <div className="unit-choice">
            <button
              onClick={() => {
                const d = createBlank("metric");
                setDesign(d);
                setRendered(d);
                setSetup(false);
              }}
            >
              Metric
            </button>
            <button
              onClick={() => {
                const d = createBlank("imperial");
                setDesign(d);
                setRendered(d);
                setSetup(false);
              }}
            >
              Imperial
            </button>
          </div>
        </Modal>
      )}
      {saveDialog && (
        <Modal>
          <h2>Save this survey project</h2>
          <div>
            <button onClick={() => void authSave("signup")}>
              Create account and save
            </button>
            <button onClick={() => void authSave("signin")}>
              Sign in and save
            </button>
            <button onClick={download}>Download project file</button>
            <button onClick={() => setSaveDialog(false)}>
              Continue editing
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <Modal>
          <h2>This project changed in another session</h2>
          <p>Your local survey is preserved.</p>
          <div>
            <button
              onClick={async () => {
                const saved = await createProject(design);
                setProjectId(saved.id);
                setConflict(false);
              }}
            >
              Save local as new project
            </button>
            <button
              onClick={async () => {
                if (!projectId) return;
                const r = await getProject(projectId),
                  d = parseProjectJson(JSON.stringify(r.project.design));
                if (d) {
                  setDesign(d);
                  setRendered(d);
                  revisionRef.current = r.project.revision;
                }
                setConflict(false);
              }}
            >
              Reload cloud version
            </button>
          </div>
        </Modal>
      )}
      {versionsOpen && (
        <Modal>
          <h2>Named milestones</h2>
          <div className="version-form">
            <input
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="Version name"
            />
            <textarea
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="Optional note"
            />
            <button
              onClick={async () => {
                if (!projectId || !versionName) return;
                const v = await createVersion(
                  projectId,
                  versionName,
                  versionNote,
                );
                setVersions((x) => [v, ...x]);
                setVersionName("");
                setVersionNote("");
              }}
            >
              Save version
            </button>
          </div>
          <div className="version-list">
            {versions.map((v) => (
              <article key={v.id}>
                <strong>{v.name}</strong>
                <button
                  onClick={async () => {
                    if (!projectId) return;
                    const r = await versionAction(
                      "restore",
                      projectId,
                      v.id,
                      revisionRef.current,
                    );
                    if (r.project) {
                      const d = parseProjectJson(
                        JSON.stringify(r.project.design),
                      );
                      if (d) {
                        setDesign(d);
                        setRendered(d);
                      }
                      revisionRef.current = r.project.revision;
                    }
                  }}
                >
                  Restore
                </button>
                <button
                  onClick={async () => {
                    if (!projectId) return;
                    await versionAction(
                      "delete",
                      projectId,
                      v.id,
                      revisionRef.current,
                    );
                    setVersions((x) => x.filter((i) => i.id !== v.id));
                  }}
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
          <button onClick={() => setVersionsOpen(false)}>Close</button>
        </Modal>
      )}
      {handoff && (
        <Modal>
          <h2>Save guest survey as a new project?</h2>
          <div>
            <button
              onClick={async () => {
                const saved = await createProject(handoff);
                setDesign(handoff);
                setRendered(handoff);
                setProjectId(saved.id);
                await localDelete(PENDING_SAVE_KEY);
                setHandoff(null);
              }}
            >
              Save as new project
            </button>
            <button
              onClick={() => {
                void localDelete(PENDING_SAVE_KEY);
                setHandoff(null);
              }}
            >
              Discard
            </button>
          </div>
        </Modal>
      )}
      {exitOpen && (
        <Modal>
          <h2>Keep your directional survey?</h2>
          <div>
            {!account && (
              <>
                <button onClick={() => void authSave("signup")}>
                  Create account and save
                </button>
                <button onClick={() => void authSave("signin")}>
                  Sign in and save
                </button>
              </>
            )}
            <button
              onClick={() => {
                download();
                finishExit();
              }}
            >
              Download and close
            </button>
            <button onClick={() => setExitOpen(false)}>Stay</button>
            <button onClick={finishExit}>Close without keeping changes</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
