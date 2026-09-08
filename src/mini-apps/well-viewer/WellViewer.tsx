/* eslint-disable react-hooks/set-state-in-effect */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, FileArchive, FileUp, Gauge, Layers3, Maximize2, PanelLeftOpen, Tags, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { clampLegMd, legColor, metresToSurveyDisplay, surveyDisplayToMetres, type SurveyLeg } from "./survey";
import { casingsAtMd, holeAtMd, inspectWellPackage, parseWellPackage, summarizeOperations, type HoleSection, type OperationalDetail, type WellImportProgress, type WellModel, type WellPackageManifest } from "./well-package";
import { joystickIntensity, nextLabelMode, type LabelMode } from "./viewer-math";
import "./well-viewer.css";

const Scene = lazy(() => import("./WellScene"));
const shouldIgnoreShortcut = (target: EventTarget | null) => (target as HTMLElement | null)?.closest("input, textarea, select, button, [contenteditable='true'], [role='dialog'], [role='slider'], .well-panel");
const nearestStation = (leg: SurveyLeg, md: number) => leg.stations.reduce((best, item) => Math.abs(item.mdM - md) < Math.abs(best.mdM - md) ? item : best, leg.stations[0]);

export default function WellViewer({ navigate }: { navigate: (path: string) => void }) {
  const [survey, setSurvey] = useState<WellModel | null>(null), [selectedLegId, setSelectedLegId] = useState(""), [selectedSectionId, setSelectedSectionId] = useState<string | null>(null), [showCasings, setShowCasings] = useState(true), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [pendingPackage, setPendingPackage] = useState<WellPackageManifest | null>(null), [detail, setDetail] = useState<OperationalDetail>("balanced"), [progress, setProgress] = useState<WellImportProgress | null>(null);
  const [fitSignal, setFitSignal] = useState(0), [navigationFocusSignal, setNavigationFocusSignal] = useState(0), [labelMode, setLabelMode] = useState<LabelMode>("off"), [currentMd, setCurrentMd] = useState(0), [depthInput, setDepthInput] = useState("0");
  const [navigationIntensity, setNavigationIntensity] = useState(0), [keyboardDepthDirection, setKeyboardDepthDirection] = useState<-1 | 0 | 1>(0), [keyboardZoomDirection, setKeyboardZoomDirection] = useState<-1 | 0 | 1>(0), [keyboardAccelerated, setKeyboardAccelerated] = useState(false), [visible, setVisible] = useState(!document.hidden);
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 720px)").matches), [panelOpen, setPanelOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null), panelOpener = useRef<HTMLButtonElement>(null), panelClose = useRef<HTMLButtonElement>(null), joystick = useRef<HTMLDivElement>(null), importAbort = useRef<AbortController | null>(null), shift = useRef(false), pressedArrows = useRef(new Set<string>()), reducedMotion = Boolean(useReducedMotion());
  const leg = useMemo(() => survey?.legs.find((item) => item.id === selectedLegId) ?? survey?.legs.at(-1) ?? null, [selectedLegId, survey]);
  const imperial = survey?.sourceUnit === "imperial", unit = imperial ? "ft" : "m";
  const stop = useCallback(() => { setNavigationIntensity(0); setKeyboardDepthDirection(0); setKeyboardZoomDirection(0); pressedArrows.current.clear(); }, []);
  const beginMove = useCallback((value: number) => { if (!leg) return; setNavigationFocusSignal((signal) => signal + 1); setNavigationIntensity(Math.min(1, Math.max(-1, value))); }, [leg]);

  useEffect(() => { document.body.classList.add("well-viewer-active"); return () => document.body.classList.remove("well-viewer-active"); }, []);
  useEffect(() => { const query = matchMedia("(max-width: 720px)"), change = () => setMobile(query.matches); query.addEventListener("change", change); return () => query.removeEventListener("change", change); }, []);
  useEffect(() => { const change = () => { setVisible(!document.hidden); if (document.hidden) stop(); }; document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change); }, [stop]);
  useEffect(() => { if (!mobile || !panelOpen) return; const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { setPanelOpen(false); requestAnimationFrame(() => panelOpener.current?.focus()); } }; addEventListener("keydown", keydown); return () => removeEventListener("keydown", keydown); }, [mobile, panelOpen]);
  useEffect(() => {
    const movementDirection = navigationIntensity || keyboardDepthDirection;
    if (!leg || movementDirection === 0) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1), span = Math.max(leg.endMdM - leg.startMdM, 1), speed = span * 0.08 * (shift.current ? 4 : 1); previous = now;
      setCurrentMd((value) => clampLegMd(leg, value + elapsed * speed * movementDirection));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [navigationIntensity, keyboardDepthDirection, leg]);
  useEffect(() => { const movementDirection = navigationIntensity || keyboardDepthDirection; if (!leg || movementDirection === 0) return; if ((movementDirection < 0 && currentMd <= leg.startMdM + 1e-6) || (movementDirection > 0 && currentMd >= leg.endMdM - 1e-6)) stop(); }, [currentMd, keyboardDepthDirection, leg, navigationIntensity, stop]);
  useEffect(() => { if (document.activeElement?.classList.contains("well-depth-input")) return; setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); }, [currentMd, imperial]);
  useEffect(() => {
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const sync = () => {
      const keys = pressedArrows.current;
      setKeyboardDepthDirection(keys.has("ArrowLeft") === keys.has("ArrowRight") ? 0 : keys.has("ArrowLeft") ? -1 : 1);
      setKeyboardZoomDirection(keys.has("ArrowUp") === keys.has("ArrowDown") ? 0 : keys.has("ArrowUp") ? -1 : 1);
    };
    const down = (event: KeyboardEvent) => {
      shift.current = event.shiftKey; setKeyboardAccelerated(event.shiftKey);
      if (!leg || !arrows.includes(event.key) || shouldIgnoreShortcut(event.target)) return;
      event.preventDefault();
      if (!pressedArrows.current.has(event.key)) {
        pressedArrows.current.add(event.key);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") setNavigationFocusSignal((signal) => signal + 1);
        sync();
      }
    };
    const up = (event: KeyboardEvent) => { shift.current = event.shiftKey; setKeyboardAccelerated(event.shiftKey); if (arrows.includes(event.key)) { pressedArrows.current.delete(event.key); sync(); } };
    const blur = () => { shift.current = false; setKeyboardAccelerated(false); stop(); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, [leg, stop]);

  const commitWell = (parsed: WellModel) => {
    const selected = parsed.legs.at(-1)!, firstSection = parsed.holeSections[selected.id]?.[0] ?? null;
    setSurvey(parsed); setSelectedLegId(selected.id); setSelectedSectionId(firstSection?.id ?? null); setShowCasings(true); setLabelMode("off"); setPanelOpen(false); setCurrentMd(selected.startMdM); setDepthInput(metresToSurveyDisplay(selected.startMdM, parsed.sourceUnit === "imperial").toFixed(1)); setFitSignal((value) => value + 1); setNavigationIntensity(0);
  };
  const processPackage = async (manifest: WellPackageManifest, selectedDetail: OperationalDetail) => {
    const controller = new AbortController(); importAbort.current = controller;
    setLoading(true); setProgress({ phase: "extracting", percent: 0, message: "Preparing the well package…" }); setError("");
    try { commitWell(await parseWellPackage(manifest, { detail: selectedDetail, signal: controller.signal }, setProgress)); setPendingPackage(null); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "This survey could not be read."); }
    finally { if (importAbort.current === controller) importAbort.current = null; setLoading(false); setProgress(null); }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { setError("Choose the original well ZIP package."); return; }
    setLoading(true); setProgress({ phase: "extracting", percent: 0, message: "Inspecting the ZIP manifest…" }); setError("");
    try {
      const manifest = await inspectWellPackage(file);
      if (manifest.requiresDetailSelection) { setDetail("balanced"); setPendingPackage(manifest); }
      else { setLoading(false); setProgress(null); await processPackage(manifest, "detailed"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This survey could not be read."); }
    finally { setLoading(false); setProgress(null); if (input.current) input.current.value = ""; }
  };
  const closeMobilePanel = () => { if (!mobile || !panelOpen) return; setPanelOpen(false); requestAnimationFrame(() => panelOpener.current?.focus()); };
  const selectLeg = (id: string) => { const next = survey?.legs.find((item) => item.id === id); if (!next) return; const md = (next.startMdM + next.endMdM) / 2; setSelectedLegId(id); setSelectedSectionId(holeAtMd(survey!, id, md)?.id ?? null); setCurrentMd(md); stop(); closeMobilePanel(); };
  const selectSection = (legId: string, section: HoleSection) => { setSelectedLegId(legId); setSelectedSectionId(section.id); setCurrentMd((section.startMdM + section.endMdM) / 2); stop(); closeMobilePanel(); };
  const commitDepth = () => { if (!leg) return; const parsed = Number(depthInput); if (!depthInput.trim() || !Number.isFinite(parsed)) { setDepthInput(metresToSurveyDisplay(currentMd, imperial).toFixed(1)); return; } const next = clampLegMd(leg, surveyDisplayToMetres(parsed, imperial)); setCurrentMd(next); setDepthInput(metresToSurveyDisplay(next, imperial).toFixed(1)); stop(); };
  const updateJoystick = (clientX: number, element: HTMLDivElement) => { const bounds = element.getBoundingClientRect(), raw = (clientX - (bounds.left + bounds.width / 2)) / Math.max(bounds.width * 0.38, 1); setNavigationIntensity(joystickIntensity(raw)); };
  const releaseJoystick = (element?: HTMLDivElement, pointerId?: number) => { if (element && pointerId != null && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId); setNavigationIntensity(0); };
  const joystickEvents = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setNavigationFocusSignal((signal) => signal + 1); updateJoystick(event.clientX, event.currentTarget); },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event.clientX, event.currentTarget); },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => releaseJoystick(event.currentTarget, event.pointerId), onPointerCancel: () => setNavigationIntensity(0), onLostPointerCapture: () => setNavigationIntensity(0),
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => { if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.repeat) { event.preventDefault(); shift.current = event.shiftKey; beginMove(event.key === "ArrowLeft" ? -1 : 1); } },
    onKeyUp: (event: ReactKeyboardEvent<HTMLDivElement>) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setNavigationIntensity(0); } },
  };
  const station = leg ? nearestStation(leg, currentMd) : null, activeHole = survey && leg ? holeAtMd(survey, leg.id, currentMd) : null, activeCasings = survey ? casingsAtMd(survey, currentMd) : [], operations = survey ? summarizeOperations(survey, currentMd) : null;

  return <main className="well-workspace">
    <div className="well-scene">{survey && leg ? <Suspense fallback={<div className="well-loading">Building surveyed well…</div>}><Scene survey={survey} selectedLegId={leg.id} selectedSectionId={selectedSectionId} currentMd={currentMd} navigationIntensity={navigationIntensity || keyboardDepthDirection} fitSignal={fitSignal} navigationFocusSignal={navigationFocusSignal} keyboardZoomDirection={keyboardZoomDirection} keyboardAccelerated={keyboardAccelerated} labelMode={labelMode} reducedMotion={reducedMotion} active={visible} showCasings={showCasings} onSelectLeg={selectLeg} onSelectSection={selectSection} onManualInteraction={() => {}}/></Suspense> : <div className="well-empty"><div><FileArchive/><span>Well ZIP</span></div><h1>Build the actual well in 3D</h1><p>Import the original well package. Survey, ETS, and drilling CSV data are combined locally and never uploaded.</p><button onClick={() => input.current?.click()}><FileUp/>Choose Well ZIP</button></div>}</div>
    <header className="well-topbar"><button aria-label="Back to portal" title="Back to portal" onClick={() => navigate("/portal")}><ArrowLeft/></button><img src="/brand/uniqenergy-mark-64.png" alt="UniqEnergy"/><span>UniqEnergy / Well Viewer</span>{survey && <button className="well-label-toggle" aria-label={`Labels: ${labelMode}`} title="Cycle scene labels" onClick={() => setLabelMode(nextLabelMode)}><Tags/><span><small>Label</small><b>{labelMode[0].toUpperCase() + labelMode.slice(1)}</b></span></button>}{survey && <button className="well-import-again" onClick={() => input.current?.click()}><FileUp/>Import another ZIP</button>}<input ref={input} className="well-file-input" type="file" accept=".zip,application/zip" onChange={(event) => void importFile(event.target.files?.[0])}/></header>
    {loading && <div className="well-status" role="status"><span>{progress?.message ?? "Reading well package…"}</span>{progress && <progress max="100" value={progress.percent}/>}<button onClick={() => importAbort.current?.abort()}>Cancel import</button></div>}{error && <div className="well-error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
    {pendingPackage && !loading && <div className="well-import-dialog-wrap"><section className="well-import-dialog" role="dialog" aria-modal="true" aria-labelledby="well-import-title"><header><div><span>Large drilling file</span><h2 id="well-import-title">Choose operational detail</h2></div><button aria-label="Cancel import" onClick={() => setPendingPackage(null)}><X/></button></header><p><b>{pendingPackage.csvFileName}</b> is {(pendingPackage.csvSizeBytes / 1_000_000).toFixed(1)} MB uncompressed. Every valid row will be examined; this setting controls depth resolution, not random row deletion. Peaks, counts, timestamps, averages, and latest values are retained.</p><div className="well-detail-options">{(["detailed", "balanced", "compact"] as const).map((choice) => <label key={choice} className={detail === choice ? "active" : ""}><input aria-label={`${choice} operational detail`} type="radio" name="operational-detail" value={choice} checked={detail === choice} onChange={() => setDetail(choice)}/><span><b>{choice[0].toUpperCase() + choice.slice(1)}</b><small>{choice === "detailed" ? "0.25 m bands · maximum depth detail" : choice === "balanced" ? "0.5 m bands · recommended" : "1.0 m bands · smallest memory use"}</small></span></label>)}</div><footer><button className="secondary" onClick={() => setPendingPackage(null)}>Cancel</button><button onClick={() => void processPackage(pendingPackage, detail)}>Import well</button></footer></section></div>}
    {survey && leg && mobile && <button ref={panelOpener} className="well-panel-opener" aria-controls="well-inspector" aria-expanded={panelOpen} onClick={() => { setPanelOpen(true); requestAnimationFrame(() => panelClose.current?.focus()); }}><PanelLeftOpen/><span>Well details</span></button>}
    {survey && leg && <aside id="well-inspector" className={`well-panel${panelOpen ? " open" : " closed"}`} aria-label="Well details" aria-hidden={mobile && !panelOpen} inert={mobile && !panelOpen}>
      <div className="well-panel-heading"><div><span>Survey data</span><strong>{survey.name}</strong>{survey.dossierId && <small>Dossier {survey.dossierId}</small>}</div>{mobile && <button ref={panelClose} className="well-panel-close" aria-label="Close well details" onClick={closeMobilePanel}><X/></button>}</div>
      <section className="well-summary"><div><span>Legs</span><b>{survey.legs.length}</b></div><div><span>Stations</span><b>{survey.legs.reduce((sum, item) => sum + item.stations.length, 0)}</b></div><div><span>Source units</span><b>{survey.sourceUnit === "imperial" ? "Imperial" : "Metric"}</b></div></section>
      <p className="well-import-meta">{survey.operationalImport.validObservations.toLocaleString()} observations summarized into {survey.operationalImport.depthBandCount.toLocaleString()} depth bands at {survey.operationalImport.depthResolutionM} m.</p>
      {survey.warnings.length > 0 && <details className="well-warnings"><summary>{survey.warnings.length} import warning{survey.warnings.length === 1 ? "" : "s"}</summary>{survey.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}
      <div className="well-leg-list">{survey.legs.map((item, index) => <button key={item.id} className={item.id === leg.id ? "active" : ""} onClick={() => selectLeg(item.id)}><i style={{ background: legColor(index) }}/><span><b>{item.name}</b><small>{item.parentId ? `Parent ${item.parentId} · ` : "Root · "}{item.stations.length} stations</small></span><em>{metresToSurveyDisplay(item.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(item.endMdM, imperial).toFixed(0)} {unit}</em></button>)}</div>
      <section className="well-engineering"><header><div><span>Physical well model</span><b>{survey.holeSections[leg.id]?.length ?? 0} hole sections · {survey.casings.length} casing strings</b></div><button className={showCasings ? "active" : ""} aria-pressed={showCasings} onClick={() => setShowCasings((value) => !value)}><Layers3/>{showCasings ? "Casing on" : "Casing off"}</button></header><div>{(survey.holeSections[leg.id] ?? []).map((section) => <button key={section.id} className={selectedSectionId === section.id ? "active" : ""} onClick={() => selectSection(leg.id, section)}><i style={{ width: Math.max(8, section.diameterMm / 22) }}/><span><b>{section.diameterMm.toFixed(0)} mm hole</b><small>MD {metresToSurveyDisplay(section.startMdM, imperial).toFixed(0)}–{metresToSurveyDisplay(section.endMdM, imperial).toFixed(0)} {unit}{section.bit ? ` · ${section.bit.manufacturer} ${section.bit.bitType}` : ""}</small></span></button>)}</div></section>
      <section className="well-cross-section"><header><span>Cross-section at current MD</span><b>{activeHole ? `${activeHole.diameterMm.toFixed(0)} mm hole` : "No confirmed hole size"}</b></header><div className="well-rings" aria-hidden="true"><i className="hole" style={{ width: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px", height: activeHole ? `${Math.max(58, activeHole.diameterMm / 2)}px` : "58px" }}/>{activeCasings.map((casing, index) => <i key={casing.id} className="casing" style={{ width: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, height: `${Math.max(24, casing.outsideDiameterMm / 2)}px`, zIndex: index + 2 }}/>)}</div><dl>{activeHole?.bit && <><div><dt>Bit</dt><dd>{activeHole.bit.bitNo || "—"}</dd></div><div><dt>Serial</dt><dd>{activeHole.bit.serialNo || "—"}</dd></div></>}{activeCasings.map((casing) => <div key={casing.id}><dt>{casing.category}</dt><dd>{casing.outsideDiameterMm} / {casing.insideDiameterMm} mm OD/ID</dd></div>)}</dl></section>
      {station && <section className="well-station"><header><Gauge/><div><span>Nearest station</span><b>MD {metresToSurveyDisplay(station.mdM, imperial).toFixed(2)} {unit}</b></div></header><dl><div><dt>TVD</dt><dd>{metresToSurveyDisplay(station.tvdM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Inclination</dt><dd>{station.inclinationDeg.toFixed(2)}°</dd></div><div><dt>Azimuth</dt><dd>{station.azimuthDeg.toFixed(2)}°</dd></div><div><dt>North</dt><dd>{metresToSurveyDisplay(station.northM, imperial).toFixed(2)} {unit}</dd></div><div><dt>East</dt><dd>{metresToSurveyDisplay(station.eastM, imperial).toFixed(2)} {unit}</dd></div><div><dt>Status</dt><dd>{station.status || "—"}</dd></div></dl></section>}
      <section className="well-operations"><header><Gauge/><div><span>Drilling data near current MD</span><b>{operations ? `${operations.sampleCount} samples within ±${operations.radiusM} m` : "No nearby samples"}</b></div></header>{operations && <>{operations.ambiguousLeg && <p className="well-correlation-note">This depth overlaps multiple survey legs. Values are well-depth observations and are not assigned to a specific branch.</p>}<small>{operations.firstTimestamp || "Unknown time"} – {operations.lastTimestamp || "Unknown time"}</small><div>{operations.statistics.map((statistic) => <article key={statistic.channel.id}><header><b>{statistic.channel.label}</b><strong>{statistic.latest.toFixed(2)} {statistic.channel.unit}</strong></header><span>Min {statistic.minimum.toFixed(2)} · Avg {statistic.average.toFixed(2)} · Max {statistic.maximum.toFixed(2)} · n={statistic.count}</span></article>)}</div></>}</section>
      <p className="well-disclaimer">Trajectory coordinates come from the survey TXT. Hole and casing radii use ETS XML dimensions at true relative scale. Operational values come from the CSV and remain browser-only.</p>
    </aside>}
    {survey && leg && <div className="well-camera-dock">
      <div ref={joystick} className="well-joystick" role="slider" tabIndex={0} aria-label="Well depth navigation" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(navigationIntensity * 100)} aria-valuetext={navigationIntensity < 0 ? `Shallower ${Math.round(Math.abs(navigationIntensity) * 100)} percent` : navigationIntensity > 0 ? `Deeper ${Math.round(navigationIntensity * 100)} percent` : "Stopped"} aria-keyshortcuts="ArrowLeft ArrowRight" {...joystickEvents}><span>Shallower</span><div className="well-joystick-track"><i style={{ left: `calc(${50 + navigationIntensity * 50}% - ${11 + navigationIntensity * 11}px)` }}><b/></i></div><span>Deeper</span></div>
      <label><span>MD</span><input className="well-depth-input" inputMode="decimal" value={depthInput} onChange={(event) => setDepthInput(event.target.value)} onBlur={commitDepth} onKeyDown={(event) => { if (event.key === "Enter") { commitDepth(); event.currentTarget.blur(); } }}/><small>{unit}</small></label>
      <button onClick={() => { stop(); setFitSignal((value) => value + 1); }}><Maximize2/><span>Fit Well</span></button>
      <span className="well-key-hint" aria-hidden="true">↑↓ Zoom · ←→ Depth · Shift 4×</span>
    </div>}
  </main>;
}
