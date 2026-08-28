/* eslint-disable react-hooks/set-state-in-effect */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import {
  Check,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Box,
  Maximize2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  FolderOpen,
  Trash2,
  Pause,
  Play,
  X,
} from "lucide-react";
import {
  confirmSection,
  applySectionEdit,
  containingSection,
  createProject as createBlank,
  cubicMetresToBbl,
  draftErrors,
  editSectionErrors,
  emptyDraft,
  generateProject,
  sectionTopMd,
  sectionColors,
  trajectoryErrors,
  truncateFrom,
  type SectionDraft,
  type UnitSystem,
  type WellProject,
  type WellTrajectory,
} from "./engineering";
import { clampMd, displayDepthToMetres, metresToDisplayDepth, sectionMidpointMd, totalMd, type CameraMode } from "./camera";
import { autosaveProject, createFluidLabProject, deleteProject, getProject, listProjects, type Project } from "./projects";
import "./fluidlab.css";
const Scene = lazy(() => import("./WellboreScene")),
  toLength = (m: number, u: UnitSystem) =>
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
  disabled = false,
  optional = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="number-field">
      <span>
        {label}
        {optional && <em> optional</em>}
      </span>
      <div>
        <input
          type="number"
          value={value == null ? "" : Number(value.toFixed(3))}
          min="0"
          step="0.1"
          disabled={disabled}
          placeholder={optional ? "Not provided" : "Required"}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
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
export default function FluidLab({
  projectId,
  navigate,
  onDirtyChange,
  exitRequest,
  onConfirmBrowserExit,
}: {
  projectId: string;
  navigate: (path: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  exitRequest: number;
  onConfirmBrowserExit: () => void;
}) {
  const [design, setDesign] = useState(() => createBlank()),
    [draft, setDraft] = useState<SectionDraft>(() => emptyDraft()),
    [draftOpen, setDraftOpen] = useState(true),
    [trajectoryDraft, setTrajectoryDraft] = useState<WellTrajectory>({
      enabled: false,
      kopMdM: null,
      endCurveMdM: null,
    }),
    [, setRevision] = useState(0),
    [saveState, setSaveState] = useState<
      "loading" | "editing" | "saving" | "saved" | "failed" | "offline" | "conflict"
    >("loading"),
    [loaded, setLoaded] = useState(false),
    [savedAt, setSavedAt] = useState<Date | null>(null),
    [collapsed, setCollapsed] = useState(false),
    [drawerOpen, setDrawerOpen] = useState(false),
    [cameraMode, setCameraMode] = useState<CameraMode>("follow"),
    [manualFitSignal, setManualFitSignal] = useState(0),
    [currentMd, setCurrentMd] = useState(0),
    [depthInput, setDepthInput] = useState("0"),
    [autoFollow, setAutoFollow] = useState(false),
    [moveDirection, setMoveDirection] = useState<-1 | 0 | 1>(0),
    [visible, setVisible] = useState(!document.hidden),
    [notice, setNotice] = useState(""),
    [exitOpen, setExitOpen] = useState(false),
    [pendingPath, setPendingPath] = useState("/portal"),
    [deleteIndex, setDeleteIndex] = useState<number | null>(null),
    [editIndex, setEditIndex] = useState<number | null>(null),
    [editDraft, setEditDraft] = useState<SectionDraft>(() => emptyDraft()),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]), [projectsLoading, setProjectsLoading] = useState(true), [projectError, setProjectError] = useState(""), [newProjectName, setNewProjectName] = useState(""), [creatingProject, setCreatingProject] = useState(false), [panelTab, setPanelTab] = useState<"projects" | "builder">(projectId ? "builder" : "projects");
  const reduced = Boolean(useReducedMotion()),
    generated = useMemo(() => generateProject(design), [design]),
    units = design.unitSystem ?? "metric",
    unitsChosen = design.unitSystem !== null,
    saving = useRef(false),
    queued = useRef(false),
    retryCount = useRef(0),
    revisionRef = useRef(0),
    designRef = useRef(design),
    drawerTrigger = useRef<HTMLButtonElement>(null),
    shiftHeld = useRef(false),
    trajectoryDirty =
      JSON.stringify(trajectoryDraft) !== JSON.stringify(design.trajectory),
    draftTouched =
      draftOpen &&
      (draft.name !== "" ||
        draft.endMdM != null ||
        draft.diameterMm != null),
    dirty =
      ["editing", "saving", "failed", "offline", "conflict"].includes(saveState) ||
      draftTouched ||
      trajectoryDirty ||
      editIndex !== null;
  useEffect(() => { designRef.current = design; }, [design]);
  const refreshProjects = useCallback(async () => {
    setProjectError("");
    try { setProjects(await listProjects()); }
    catch { setProjectError("Projects could not be loaded."); }
    finally { setProjectsLoading(false); }
  }, []);
  useEffect(() => { void refreshProjects(); }, [refreshProjects]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => { if (!visible) { setAutoFollow(false); setMoveDirection(0); } }, [visible]);
  useEffect(() => {
    setCurrentMd(0); setDepthInput("0"); setCameraMode("follow"); setAutoFollow(false); setMoveDirection(0);
  }, [projectId]);
  useEffect(() => {
    if (!autoFollow && moveDirection === 0) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1), maximum = totalMd(design);
      previous = now;
      const rate = maximum * (autoFollow ? 0.02 : 0.08) * (shiftHeld.current ? 4 : 1);
      setCurrentMd((value) => {
        const next = clampMd(design, value + rate * elapsed * (autoFollow ? 1 : moveDirection));
        if (autoFollow && next >= maximum) setAutoFollow(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoFollow, design, moveDirection]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      shiftHeld.current = event.shiftKey;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog'], .workspace-panel")) return;
      event.preventDefault(); setAutoFollow(false); setCameraMode("follow"); setMoveDirection(event.key === "ArrowUp" ? -1 : 1);
    };
    const up = (event: KeyboardEvent) => {
      shiftHeld.current = event.shiftKey;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") setMoveDirection(0);
    };
    const stop = () => { shiftHeld.current = false; setMoveDirection(0); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", stop);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", stop); };
  }, []);
  useEffect(() => {
    if (document.activeElement?.classList.contains("camera-depth-input")) return;
    setDepthInput(metresToDisplayDepth(currentMd, units === "imperial").toFixed(1));
  }, [currentMd, units]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    addEventListener("beforeunload", leave);
    return () => removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    if (exitRequest) setExitOpen(true);
  }, [exitRequest]);
  useEffect(() => {
    if (!drawerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        requestAnimationFrame(() => drawerTrigger.current?.focus());
      }
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [drawerOpen]);
  useEffect(() => {
    let active = true;
    if (!projectId) {
      const blank = createBlank();
      setDesign(blank); designRef.current = blank; setTrajectoryDraft(blank.trajectory); setDraft(emptyDraft()); setLoaded(false); setPanelTab("projects"); setSaveState("loading");
      return () => { active = false; };
    }
    setPanelTab("builder");
    void getProject(projectId)
      .then((result) => {
        if (!result) return;
        const { project } = result;
        if (!active) return;
        if (project.type !== "fluidlab" || !project.data || !("sections" in project.data)) throw new Error("Unsupported project");
        setDesign(project.data);
        designRef.current = project.data;
        setTrajectoryDraft(project.data.trajectory);
        setDraft(emptyDraft());
        setDraftOpen(project.data.sections.length === 0);
        setSelectedId(project.data.sections.at(-1)?.id ?? null);
        setRevision(project.revision);
        revisionRef.current = project.revision;
        setSaveState("saved");
        setSavedAt(project.updatedAt ? new Date(project.updatedAt) : new Date());
        setLoaded(true);
      })
      .catch(() => {
        if (active) {
          setNotice("This project could not be opened.");
          setSaveState("failed");
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, navigate]);
  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true); setProjectError("");
    try { const project = await createFluidLabProject(name); setProjects((items) => [project, ...items]); setNewProjectName(""); navigate(`/apps/fluidlab/projects/${project.id}`); setPanelTab("builder"); }
    catch { setProjectError("The project could not be created."); }
    finally { setCreatingProject(false); }
  };
  const removeProject = async (project: Project) => {
    if (!window.confirm(`Permanently delete “${project.name}”?`)) return;
    try { await deleteProject(project.id); setProjects((items) => items.filter((item) => item.id !== project.id)); if (project.id === projectId) navigate("/apps/fluidlab"); }
    catch { setProjectError("The project could not be deleted."); }
  };
  const updateDesign = (recipe: (next: WellProject) => void) => {
    setDesign((current) => {
      const next = structuredClone(current);
      recipe(next);
      return next;
    });
    setSaveState("editing");
  };
  const confirm = () => {
    const errors = draftErrors(design, draft);
    if (errors.length) {
      setNotice(errors[0]);
      return;
    }
    const next = structuredClone(design),
      result = confirmSection(next, draft);
    if (!result.section) return;
    setDesign(next);
    setSelectedId(result.section.id);
    setDraft(emptyDraft());
    setDraftOpen(false);
    setSaveState("editing");
  };
  const applyTrajectory = () => {
    const candidate = {
        ...trajectoryDraft,
        kopMdM: trajectoryDraft.enabled ? trajectoryDraft.kopMdM : null,
        endCurveMdM: trajectoryDraft.enabled
          ? trajectoryDraft.endCurveMdM
          : null,
      },
      errors = trajectoryErrors(design, candidate);
    if (errors.length) {
      setNotice(errors[0]);
      return;
    }
    updateDesign((next) => (next.trajectory = candidate));
    setTrajectoryDraft(candidate);
  };
  const beginEdit = (index: number) => {
    const section = design.sections[index];
    setEditIndex(index);
    setEditDraft({
      name: section.name,
      endMdM: section.endMdM,
      diameterMm: section.diameterMm,
      color: section.color,
    });
    setSelectedId(section.id);
  };
  const applyEdit = () => {
    if (editIndex == null) return;
    const errors = editSectionErrors(design, editIndex, editDraft);
    if (errors.length) {
      setNotice(errors[0]);
      return;
    }
    const next = structuredClone(design);
    applySectionEdit(next, editIndex, editDraft);
    setDesign(next);
    setSelectedId(next.sections[editIndex].id);
    setEditIndex(null);
    setSaveState("editing");
  };
  const removeFrom = () => {
    if (deleteIndex == null) return;
    const next = structuredClone(design),
      result = truncateFrom(next, deleteIndex);
    if (!result) return;
    setDesign(next);
    setTrajectoryDraft(next.trajectory);
    setDraft(result.draft);
    setDraftOpen(true);
    setSelectedId(next.sections.at(-1)?.id ?? null);
    setEditIndex(null);
    setDeleteIndex(null);
    setSaveState("editing");
    if (result.trajectoryCleared)
      setNotice(
        "The applied trajectory was cleared because it exceeded the new total MD.",
      );
  };
  const performAutosave = useCallback(async () => {
    if (saving.current || saveState === "conflict") {
      if (saving.current) queued.current = true;
      return;
    }
    const snapshot = structuredClone(designRef.current);
    if (!snapshot.name.trim()) {
      setSaveState("failed");
      setNotice("Enter a project name before autosaving.");
      return;
    }
    saving.current = true;
    setSaveState("saving");
    let conflictFound = false;
    try {
      const saved = await autosaveProject(
        projectId,
        snapshot.name,
        snapshot,
        revisionRef.current,
        crypto.randomUUID(),
      );
      revisionRef.current = saved.revision;
      setRevision(saved.revision);
      setSavedAt(saved.updatedAt ? new Date(saved.updatedAt) : new Date());
      retryCount.current = 0;
      setSaveState("saved");
    } catch (error) {
      const code = String((error as { code?: string }).code || "");
      if (code.includes("aborted")) {
        conflictFound = true;
        setSaveState("conflict");
      }
      else if (/unavailable|deadline|network|internal/.test(code)) {
        setSaveState("offline");
        if (retryCount.current < 4) {
          const delay = Math.min(8000, 1000 * 2 ** retryCount.current++);
          window.setTimeout(() => setSaveState("editing"), delay);
        } else setSaveState("failed");
      } else setSaveState("failed");
    } finally {
      saving.current = false;
      if (queued.current && !conflictFound) {
        queued.current = false;
        window.setTimeout(() => setSaveState("editing"), 0);
      }
    }
  }, [projectId, saveState]);
  useEffect(() => {
    if (!loaded || saveState !== "editing") return;
    const timer = window.setTimeout(() => void performAutosave(), 1000);
    return () => window.clearTimeout(timer);
  }, [design, loaded, performAutosave, saveState]);
  const kopSection = containingSection(design, trajectoryDraft.kopMdM),
    eocSection = containingSection(design, trajectoryDraft.endCurveMdM),
    topMd = design.sections.at(-1)?.endMdM ?? 0;
  const closeDrawer = () => {
    setDrawerOpen(false);
    requestAnimationFrame(() => drawerTrigger.current?.focus());
  };
  const moveTo = (path: string) => {
    if (dirty) { setPendingPath(path); setExitOpen(true); }
    else navigate(path);
  };
  const focusSection = (sectionId: string) => {
    setSelectedId(sectionId);
    const midpoint = sectionMidpointMd(design, sectionId);
    if (midpoint != null) setCurrentMd(midpoint);
    setCameraMode("follow"); setAutoFollow(false); setMoveDirection(0);
  };
  const commitDepth = () => {
    const parsed = Number(depthInput);
    if (!depthInput.trim() || !Number.isFinite(parsed)) { setDepthInput(metresToDisplayDepth(currentMd, units === "imperial").toFixed(1)); return; }
    const next = clampMd(design, displayDepthToMetres(parsed, units === "imperial"));
    setCurrentMd(next); setDepthInput(metresToDisplayDepth(next, units === "imperial").toFixed(1));
    setCameraMode("follow"); setAutoFollow(false); setMoveDirection(0);
  };
  const beginMove = (direction: -1 | 1) => { setCameraMode("follow"); setAutoFollow(false); setMoveDirection(direction); };
  const endMove = () => setMoveDirection(0);
  const holdButtonProps = (direction: -1 | 1) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); beginMove(direction); },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); endMove(); },
    onPointerCancel: endMove,
    onLostPointerCapture: endMove,
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); beginMove(direction); } },
    onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); endMove(); } },
  });
  return (
    <main
      className={`fluidlab-workspace ${collapsed ? "panel-collapsed" : ""}`}
    >
      <div className="workspace-scene">
        <Suspense
          fallback={
            <div className="scene-loading">Building applied profile…</div>
          }
        >
          <Scene
            design={design}
            selectedSectionId={selectedId}
            reducedMotion={reduced}
            active={visible}
            cameraMode={cameraMode}
            currentMd={currentMd}
            manualFitSignal={manualFitSignal}
            onContextLost={() =>
              setNotice(
                "The 3D context was interrupted. Reload if the scene does not recover.",
              )
            }
            onSelect={focusSection}
            onManualCameraInteraction={() => setAutoFollow(false)}
          />
        </Suspense>
        {!projectId && <div className="fluidlab-empty-workspace"><FolderOpen/><h1>Choose a FluidLab project</h1><p>Open an existing project or create a new one from the Projects panel.</p></div>}
      </div>
      <header className="workspace-topbar compact">
        <button className="workspace-portal-return" aria-label="Back to mini apps" title="Back to mini apps" onClick={() => moveTo("/portal")}><ArrowLeft aria-hidden="true" /></button>
        <div className="workspace-brand">
          <img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy" />
          <span>UniqEnergy / FluidLab</span>
        </div>
      </header>
      <button ref={drawerTrigger} className="mobile-menu-button" aria-label="Open FluidLab panel" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><Menu/><b>FluidLab</b></button>
      {drawerOpen && (
        <button
          className="drawer-backdrop"
          aria-label="Close well builder"
          onClick={closeDrawer}
        />
      )}
      <aside className={`workspace-panel sequential-panel ${drawerOpen ? "drawer-open" : ""}`} aria-label="Well builder">
        {collapsed && (
          <button
            className="collapsed-panel-hit"
            aria-label="Expand well builder"
            onClick={() => setCollapsed(false)}
          />
        )}
        <div className="fluidlab-panel-tabs" role="tablist" aria-label="FluidLab workspace"><button className={panelTab === "projects" ? "active" : ""} role="tab" aria-selected={panelTab === "projects"} onClick={() => setPanelTab("projects")}><FolderOpen/>Projects</button><button className={panelTab === "builder" ? "active" : ""} role="tab" aria-selected={panelTab === "builder"} disabled={!projectId} onClick={() => setPanelTab("builder")}><Box/>Builder</button></div>
        {panelTab === "projects" ? <div className="panel-body fluidlab-projects"><form onSubmit={(event) => { event.preventDefault(); void createProject(); }}><label><span>New project</span><input value={newProjectName} maxLength={100} placeholder="Project name" onChange={(event) => setNewProjectName(event.target.value)}/></label><button disabled={!newProjectName.trim() || creatingProject}><Plus/>{creatingProject ? "Creating…" : "Create project"}</button></form>{projectError && <p className="fluidlab-project-error">{projectError}</p>}<div className="fluidlab-project-list">{projectsLoading ? <p>Loading projects…</p> : projects.length ? projects.map((project) => <article className={project.id === projectId ? "active" : ""} key={project.id}><button onClick={() => { moveTo(`/apps/fluidlab/projects/${project.id}`); if (!dirty) setPanelTab("builder"); }}><b>{project.name}</b><small>Updated {new Date(project.updatedAt).toLocaleDateString()}</small></button><button aria-label={`Delete ${project.name}`} onClick={() => void removeProject(project)}><Trash2/></button></article>) : <div className="fluidlab-project-empty"><FolderOpen/><b>No projects yet</b><span>Create your first FluidLab project above.</span></div>}</div></div> : <>
        <div className="panel-heading">
          <div>
            <span>Sequential well builder</span>
            <strong>
              {design.sections.length} confirmed section
              {design.sections.length === 1 ? "" : "s"}
            </strong>
          </div>
          <button onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button className="mobile-drawer-close" aria-label="Close well builder" onClick={closeDrawer}><X/></button>
        </div>
        <div className="panel-body editor-content">
          <section className="project-identity">
            <label><span>Project name</span><input value={design.name} maxLength={100} onChange={(event) => updateDesign((next) => { next.name = event.target.value; })}/></label>
            <div className={`autosave-state ${saveState}`}><i />
              <span>{saveState === "loading" ? "Loading project…" : saveState === "saving" ? "Saving…" : saveState === "saved" ? `Saved${savedAt ? ` ${savedAt.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}` : ""}` : saveState === "offline" ? "Offline · retrying" : saveState === "conflict" ? "Cloud conflict · reload required" : saveState === "failed" ? "Autosave needs attention" : "Changes pending"}</span>
              {saveState === "conflict" && <button onClick={() => location.reload()}>Reload</button>}
            </div>
          </section>
          {!unitsChosen ? <section className="unit-setup"><span>Step 1</span><h2>Choose project units</h2><p>This choice is permanent for this project.</p><div><button onClick={() => updateDesign((next) => { next.unitSystem = "metric"; })}>Metric<small>metres · millimetres</small></button><button onClick={() => updateDesign((next) => { next.unitSystem = "imperial"; })}>Imperial<small>feet · inches</small></button></div></section> : <div className="locked-units"><span>Units</span><strong>{units === "metric" ? "Metric · m / mm" : "Imperial · ft / in"}</strong><small>Locked for this project</small></div>}
          {unitsChosen && <>
          <section className="trajectory-card">
            <div>
              <b>Applied trajectory</b>
              <small>
                {design.trajectory.enabled
                  ? `Build ${toLength(design.trajectory.kopMdM!, units).toFixed(1)}–${toLength(design.trajectory.endCurveMdM!, units).toFixed(1)} ${lunit(units)}`
                  : "Entire well vertical"}
              </small>
            </div>
            <label className="trajectory-toggle">
              <input
                type="checkbox"
                checked={trajectoryDraft.enabled}
                onChange={(event) =>
                  setTrajectoryDraft((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />{" "}
              Add build to horizontal
            </label>
            {trajectoryDraft.enabled && (
              <div className="trajectory-fields">
                <Field
                  label="KOP MD"
                  value={
                    trajectoryDraft.kopMdM == null
                      ? null
                      : toLength(trajectoryDraft.kopMdM, units)
                  }
                  unit={lunit(units)}
                  onChange={(value) =>
                    setTrajectoryDraft((current) => ({
                      ...current,
                      kopMdM: value == null ? null : fromLength(value, units),
                    }))
                  }
                />
                <Field
                  label="End of Curve MD"
                  value={
                    trajectoryDraft.endCurveMdM == null
                      ? null
                      : toLength(trajectoryDraft.endCurveMdM, units)
                  }
                  unit={lunit(units)}
                  onChange={(value) =>
                    setTrajectoryDraft((current) => ({
                      ...current,
                      endCurveMdM:
                        value == null ? null : fromLength(value, units),
                    }))
                  }
                />
                <p>
                  KOP:{" "}
                  {kopSection?.name ||
                    (kopSection &&
                      `Section ${design.sections.indexOf(kopSection) + 1}`) ||
                    "Outside confirmed sections"}
                  <br />
                  End of Curve:{" "}
                  {eocSection?.name ||
                    (eocSection &&
                      `Section ${design.sections.indexOf(eocSection) + 1}`) ||
                    "Outside confirmed sections"}
                </p>
              </div>
            )}
            <button
              className="apply-trajectory"
              disabled={!trajectoryDirty || !design.sections.length}
              onClick={applyTrajectory}
            >
              <Check /> Apply trajectory
            </button>
          </section>
          <div className="section-stack">
            {design.sections.map((section, index) => {
              const derived = generated.sections[index],
                top = sectionTopMd(design, index);
              return (
                <article
                  className={`locked-section ${selectedId === section.id ? "selected" : ""}`}
                  key={section.id}
                >
                  <header>
                    <span style={{ background: section.color, color: "#03131d" }}>{index + 1}</span>
                    <button
                      className="locked-section-select"
                      onClick={() => focusSection(section.id)}
                    >
                      <b>{section.name || `Section ${index + 1}`}</b>
                      <small>Confirmed and locked</small>
                    </button>
                    <div className="locked-section-actions">
                      <button title="Edit section" onClick={() => beginEdit(index)}><Pencil /></button>
                      <button title="Delete this section and everything below" onClick={() => setDeleteIndex(index)}><Trash2 /></button>
                    </div>
                  </header>
                  <dl>
                    <div>
                      <dt>Top MD</dt>
                      <dd>
                        {toLength(top, units).toFixed(1)} {lunit(units)}
                      </dd>
                    </div>
                    <div>
                      <dt>Bottom MD</dt>
                      <dd>
                        {toLength(section.endMdM, units).toFixed(1)}{" "}
                        {lunit(units)}
                      </dd>
                    </div>
                    <div>
                      <dt>Bit size</dt>
                      <dd>
                        {toDiameter(section.diameterMm, units).toFixed(2)}{" "}
                        {dunit(units)}
                      </dd>
                    </div>
                    <div><dt>Color</dt><dd><i className="section-color-dot" style={{background:section.color}}/>{section.color.toUpperCase()}</dd></div>
                    <div>
                      <dt>Capacity</dt>
                      <dd>
                        {derived &&
                          (units === "metric"
                            ? `${derived.capacityM3.toFixed(2)} m³`
                            : `${cubicMetresToBbl(derived.capacityM3).toFixed(2)} bbl`)}
                      </dd>
                    </div>
                  </dl>
                  {editIndex === index && (
                    <fieldset className="section-edit-form">
                      <legend>Edit Section {index + 1}</legend>
                      <label className="text-field"><span>Name <em>optional</em></span><input value={editDraft.name} maxLength={80} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))}/></label>
                      <div className="draft-grid">
                        <Field label="Top MD" value={toLength(top, units)} unit={lunit(units)} disabled onChange={() => {}} />
                        <Field label="Bottom MD" value={editDraft.endMdM == null ? null : toLength(editDraft.endMdM, units)} unit={lunit(units)} onChange={(value) => setEditDraft((current) => ({ ...current, endMdM: value == null ? null : fromLength(value, units) }))}/>
                        <Field label="Bit size" value={editDraft.diameterMm == null ? null : toDiameter(editDraft.diameterMm, units)} unit={dunit(units)} onChange={(value) => setEditDraft((current) => ({ ...current, diameterMm: value == null ? null : fromDiameter(value, units) }))}/>
                      </div>
                      <div className="color-picker"><span>Section color</span><div>{sectionColors.map((color) => <button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={editDraft.color === color} className={editDraft.color === color ? "active" : ""} style={{background:color}} onClick={() => setEditDraft((current) => ({...current,color}))}/>) }<label title="Custom color"><input type="color" value={editDraft.color} onChange={(event) => setEditDraft((current) => ({...current,color:event.target.value}))}/><span>Custom</span></label></div></div>
                      {editSectionErrors(design, index, editDraft).length > 0 && <p className="draft-error">{editSectionErrors(design, index, editDraft)[0]}</p>}
                      <div className="draft-actions"><button onClick={() => setEditIndex(null)}>Cancel</button><button className="confirm-section" onClick={applyEdit}><Check /> Apply Changes</button></div>
                    </fieldset>
                  )}
                </article>
              );
            })}
          </div>
          {draftOpen ? (
            <fieldset className="draft-section">
              <legend>
                <span>{design.sections.length + 1}</span>
                <b>Section {design.sections.length + 1} draft</b>
              </legend>
              <label className="text-field">
                <span>
                  Name <em>optional</em>
                </span>
                <input
                  value={draft.name}
                  maxLength={80}
                  placeholder={`Section ${design.sections.length + 1}`}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="draft-grid">
                <Field
                  label="Top MD"
                  value={toLength(topMd, units)}
                  unit={lunit(units)}
                  disabled
                  onChange={() => {}}
                />
                <Field
                  label="Bottom MD"
                  value={
                    draft.endMdM == null ? null : toLength(draft.endMdM, units)
                  }
                  unit={lunit(units)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      endMdM: value == null ? null : fromLength(value, units),
                    }))
                  }
                />
                <Field
                  label="Bit size"
                  value={
                    draft.diameterMm == null
                      ? null
                      : toDiameter(draft.diameterMm, units)
                  }
                  unit={dunit(units)}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      diameterMm:
                        value == null ? null : fromDiameter(value, units),
                    }))
                  }
                />
              </div>
              <div className="color-picker"><span>Section color</span><div>{sectionColors.map((color) => <button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={draft.color === color} className={draft.color === color ? "active" : ""} style={{background:color}} onClick={() => setDraft((current) => ({...current,color}))}/>) }<label title="Custom color"><input type="color" value={draft.color} onChange={(event) => setDraft((current) => ({...current,color:event.target.value}))}/><span>Custom</span></label></div></div>
              {draftErrors(design, draft).length > 0 && draftTouched && (
                <p className="draft-error">{draftErrors(design, draft)[0]}</p>
              )}
              <div className="draft-actions">
                {design.sections.length > 0 && (
                  <button
                    onClick={() => {
                      setDraft(emptyDraft());
                      setDraftOpen(false);
                    }}
                  >
                    Discard draft
                  </button>
                )}
                <button className="confirm-section" onClick={confirm}>
                  <Check /> Confirm Section
                </button>
              </div>
            </fieldset>
          ) : (
            <button
              className="add-row"
              onClick={() => {
                setDraft(emptyDraft());
                setDraftOpen(true);
              }}
            >
              <Plus /> Add Next Section
            </button>
          )}
          {design.sections.length > 0 && (
            <section className="total-capacity">
              <span>Total MD</span>
              <strong>
                {toLength(design.sections.at(-1)!.endMdM, units).toFixed(1)}{" "}
                {lunit(units)}
              </strong>
              <span>Confirmed sections</span><strong>{design.sections.length}</strong>
              <span>Horizontal displacement</span>
              <strong>
                {toLength(generated.totalHorizontalM, units).toFixed(1)}{" "}
                {lunit(units)}
              </strong>
              <span>Open-hole capacity</span>
              <strong>
                {units === "metric"
                  ? `${generated.totalCapacityM3.toFixed(2)} m³`
                  : `${cubicMetresToBbl(generated.totalCapacityM3).toFixed(2)} bbl`}
              </strong>
            </section>
          )}
          <p className="concept-disclaimer">
            Construction sections control MD and bit size. Only applied KOP/EOC
            values control the visual trajectory.
          </p>
          </>}
        </div>
        </>}
      </aside>
      <div className="camera-toolbar">
        <button className="camera-hold-button" aria-label="Move toward surface" title="Hold to move toward surface (Arrow Up)" {...holdButtonProps(-1)}><ArrowUp/><span>Shallower</span></button>
        <label className="camera-depth"><span>MD</span><input className="camera-depth-input" inputMode="decimal" value={depthInput} onChange={(event) => setDepthInput(event.target.value)} onBlur={commitDepth} onKeyDown={(event) => { if (event.key === "Enter") { commitDepth(); event.currentTarget.blur(); } }}/><small>{lunit(units)}</small></label>
        <button className="camera-hold-button" aria-label="Move toward total depth" title="Hold to move toward total depth (Arrow Down)" {...holdButtonProps(1)}><ArrowDown/><span>Deeper</span></button>
        <button className={autoFollow ? "active" : ""} onClick={() => { setMoveDirection(0); setCameraMode("follow"); setAutoFollow((value) => !value); }}>{autoFollow ? <Pause/> : <Play/>}<span>{autoFollow ? "Pause" : "Auto"}</span></button>
        <button className={cameraMode === "manual" ? "active" : ""} title="Fit the complete well and control the camera" onClick={() => { setMoveDirection(0); setAutoFollow(false); setCameraMode("manual"); setManualFitSignal((value) => value + 1); }}><Maximize2/><span>Manual</span></button>
      </div>
      {notice && (
        <button className="workspace-notice" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
      {deleteIndex != null && (
        <Modal>
          <h2>Delete Section {deleteIndex + 1} and everything below?</h2>
          <p>
            This removes {design.sections.length - deleteIndex} confirmed
            section{design.sections.length - deleteIndex === 1 ? "" : "s"}.
            Section {deleteIndex + 1} will return as an editable draft.
            {design.trajectory.enabled &&
            design.trajectory.endCurveMdM! >
              (deleteIndex ? design.sections[deleteIndex - 1].endMdM : 0)
              ? " The applied trajectory will also be cleared."
              : ""}
          </p>
          <div>
            <button onClick={() => setDeleteIndex(null)}>Cancel</button>
            <button className="danger" onClick={removeFrom}>
              Delete from here
            </button>
          </div>
        </Modal>
      )}
      {exitOpen && (
        <Modal>
          <h2>Leave this design?</h2>
          <p>Unsaved changes and section drafts will be lost.</p>
          <div>
            <button onClick={() => setExitOpen(false)}>Keep editing</button>
            <button
              className="danger"
              onClick={() => {
                onDirtyChange(false);
                if (exitRequest) onConfirmBrowserExit();
                else navigate(pendingPath);
              }}
            >
              Leave without saving
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
