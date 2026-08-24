/* eslint-disable react-hooks/set-state-in-effect */
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
  Check,
  FolderOpen,
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
  confirmSection,
  containingSection,
  createProject as createBlank,
  cubicMetresToBbl,
  draftErrors,
  emptyDraft,
  generateProject,
  sectionTopMd,
  trajectoryErrors,
  truncateFrom,
  type SectionDraft,
  type UnitSystem,
  type WellProject,
  type WellTrajectory,
} from "./engineering";
import { createProject, getProject, updateProject } from "./projects";
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
  const [design, setDesign] = useState(() => createBlank()),
    [draft, setDraft] = useState<SectionDraft>(() => emptyDraft()),
    [draftOpen, setDraftOpen] = useState(true),
    [trajectoryDraft, setTrajectoryDraft] = useState<WellTrajectory>({
      enabled: false,
      kopMdM: null,
      endCurveMdM: null,
    }),
    [projectId, setProjectId] = useState(() =>
      new URLSearchParams(location.search).get("project"),
    ),
    [revision, setRevision] = useState(0),
    [saveState, setSaveState] = useState<
      "editing" | "saving" | "saved" | "failed"
    >("editing"),
    [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [view, setView] = useState<"perspective" | "profile">("perspective"),
    [fitSignal, setFitSignal] = useState(0),
    [visible, setVisible] = useState(!document.hidden),
    [notice, setNotice] = useState(""),
    [exitOpen, setExitOpen] = useState(false),
    [conflict, setConflict] = useState(false),
    [deleteIndex, setDeleteIndex] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const reduced = Boolean(useReducedMotion()),
    generated = useMemo(() => generateProject(design), [design]),
    account = Boolean(user && !user.isAnonymous),
    units = design.unitSystem,
    saving = useRef(false),
    trajectoryDirty =
      JSON.stringify(trajectoryDraft) !== JSON.stringify(design.trajectory),
    draftTouched =
      draftOpen &&
      (draft.name !== "" ||
        draft.endMdM != null ||
        draft.referenceTvdM != null ||
        draft.diameterMm != null),
    dirty = saveState !== "saved" || draftTouched || trajectoryDirty;
  useEffect(
    () =>
      onAuthStateChanged(auth, (current) => {
        setUser(current);
        setAuthReady(true);
      }),
    [],
  );
  useEffect(() => {
    void ensureFluidLabIdentity();
  }, []);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
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
    if (!projectId || !account) return;
    let active = true;
    void getProject(projectId)
      .then((project) => {
        if (!active) return;
        setDesign(project.design!);
        setTrajectoryDraft(project.design!.trajectory);
        setDraft(emptyDraft());
        setDraftOpen(false);
        setSelectedId(project.design!.sections.at(-1)?.id ?? null);
        setRevision(project.revision);
        setSaveState("saved");
      })
      .catch(() => {
        if (active) {
          setNotice("This project could not be opened.");
          setProjectId(null);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, account]);
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
    setDeleteIndex(null);
    setSaveState("editing");
    if (result.trajectoryCleared)
      setNotice(
        "The applied trajectory was cleared because it exceeded the new total MD.",
      );
  };
  const canSave =
    design.sections.length > 0 &&
    !draftOpen &&
    !trajectoryDirty &&
    !generated.errors.length;
  const save = useCallback(async () => {
    if (!canSave) {
      setNotice(
        draftOpen
          ? "Confirm or discard the current section draft before saving."
          : "Apply the trajectory changes before saving.",
      );
      return;
    }
    if (!account) {
      onAuth(
        `/signin?returnTo=${encodeURIComponent(location.pathname + location.search)}`,
      );
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setSaveState("saving");
    try {
      if (projectId) {
        const saved = await updateProject(
          projectId,
          design,
          revision,
          crypto.randomUUID(),
        );
        setRevision(saved.revision);
      } else {
        const saved = await createProject(design);
        setProjectId(saved.id);
        setRevision(saved.revision);
        history.replaceState({}, "", `/fluidlab?project=${saved.id}`);
      }
      setSaveState("saved");
    } catch (error) {
      if (String((error as { code?: string }).code).includes("aborted"))
        setConflict(true);
      setSaveState("failed");
    } finally {
      saving.current = false;
    }
  }, [
    account,
    canSave,
    design,
    draftOpen,
    onAuth,
    projectId,
    revision,
  ]);
  const kopSection = containingSection(design, trajectoryDraft.kopMdM),
    eocSection = containingSection(design, trajectoryDraft.endCurveMdM),
    topMd = design.sections.at(-1)?.endMdM ?? 0,
    topReference =
      design.sections.at(-1)?.referenceTvdM ??
      (design.sections.length ? null : 0);
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
            view={view}
            fitSignal={fitSignal}
            onContextLost={() =>
              setNotice(
                "The 3D context was interrupted. Reload if the scene does not recover.",
              )
            }
            onSelect={setSelectedId}
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
            onChange={(event) =>
              updateDesign((next) => (next.name = event.target.value))
            }
          />
          <small>Sequential sections · optional KOP/EOC build</small>
        </div>
        <div className="workspace-status">
          <span className={saveState}>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved to cloud"
                : saveState === "failed"
                  ? "Save failed"
                  : "Unsaved changes"}
          </span>
          <button disabled={!canSave} onClick={() => void save()}>
            <Save /> {account ? "Save" : "Sign in to save"}
          </button>
          {account && (
            <button onClick={() => onAuth("/fluidlab/projects")}>
              <FolderOpen /> Projects
            </button>
          )}
          {authReady &&
            (account ? (
              <button title="Sign out" onClick={() => void signOut(auth)}>
                <LogOut />
              </button>
            ) : (
              <button
                title="Sign in"
                onClick={() => onAuth("/signin?returnTo=/fluidlab")}
              >
                <LogIn />
              </button>
            ))}
        </div>
      </header>
      <aside className="workspace-panel sequential-panel">
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
        </div>
        <div className="panel-body editor-content">
          <label className="text-field">
            <span>Units</span>
            <select
              value={units}
              onChange={(event) =>
                updateDesign(
                  (next) =>
                    (next.unitSystem = event.target.value as UnitSystem),
                )
              }
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </label>
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
                    <span>{index + 1}</span>
                    <button
                      className="locked-section-select"
                      onClick={() => setSelectedId(section.id)}
                    >
                      <b>{section.name || `Section ${index + 1}`}</b>
                      <small>Confirmed and locked</small>
                    </button>
                    <button
                      title="Delete this section and everything below"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteIndex(index);
                      }}
                    >
                      <Trash2 />
                    </button>
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
                    <div>
                      <dt>Reference TVD</dt>
                      <dd>
                        {section.referenceTvdM == null
                          ? "Not provided"
                          : `${toLength(section.referenceTvdM, units).toFixed(1)} ${lunit(units)}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Visual TVD</dt>
                      <dd>
                        {derived
                          ? `${toLength(derived.endVisualTvdM, units).toFixed(1)} ${lunit(units)}`
                          : "—"}
                      </dd>
                    </div>
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
                  label="Top TVD"
                  value={
                    topReference == null ? null : toLength(topReference, units)
                  }
                  unit={lunit(units)}
                  disabled
                  onChange={() => {}}
                  optional
                />
                <Field
                  label="Bottom TVD"
                  value={
                    draft.referenceTvdM == null
                      ? null
                      : toLength(draft.referenceTvdM, units)
                  }
                  unit={lunit(units)}
                  optional
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      referenceTvdM:
                        value == null ? null : fromLength(value, units),
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
              <span>Visual TVD</span>
              <strong>
                {toLength(generated.totalVisualTvdM, units).toFixed(1)}{" "}
                {lunit(units)}
              </strong>
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
        </div>
      </aside>
      <div className="camera-toolbar">
        <button
          className={view === "perspective" ? "active" : ""}
          onClick={() => setView("perspective")}
        >
          Perspective
        </button>
        <button
          className={view === "profile" ? "active" : ""}
          onClick={() => setView("profile")}
        >
          Profile
        </button>
        <button
          title="Fit current well"
          onClick={() => setFitSignal((value) => value + 1)}
        >
          <RotateCcw /> Fit
        </button>
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
                else onHome();
              }}
            >
              Leave without saving
            </button>
          </div>
        </Modal>
      )}
      {conflict && (
        <Modal>
          <h2>Newer cloud changes exist</h2>
          <p>Reload the saved project before continuing.</p>
          <div>
            <button onClick={() => setConflict(false)}>Keep this screen</button>
            <button onClick={() => location.reload()}>Reload project</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
